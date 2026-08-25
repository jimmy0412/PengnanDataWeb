"""FastAPI application entry point."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from app.config import (
    ALL_VILLAGES_LABEL,
    LINE_CHART_METRICS,
    STATIC_DIR,
    STATISTICS_PAGE_URL,
    TARGET_VILLAGES,
    TEMPLATES_DIR,
)
from app.services.export_ods import load_status
from app.services.map_layers import (
    MapLayerDataNotFoundError,
    MapLayerValidationError,
    create_custom_layer,
    create_custom_layer_from_data,
    create_map_layer_from_data_v2,
    create_map_layer_v2,
    delete_custom_layer,
    load_catalog_v2,
    load_custom_layers,
    update_map_layer_colors_v2,
)
from app.services.jobs import create_job, get_job, submit_job
from app.services.pipeline import delete_year, process_years
from app.services.query_data import (
    build_indicators_pivot,
    build_map_village_data,
    query_age_structure,
    query_indicators,
)
from app.utils import parse_years_input

app = FastAPI(title="澎湖馬公 7 里人口資料")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


class ProcessRequest(BaseModel):
    years: list[int] | None = None
    years_text: str | None = Field(None, description="e.g. 110-114 or 110,111,112")
    download: bool = True


class MapLayerFromDataRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    chart_type: Literal["bar", "pie", "donut", "choropleth"]
    year: int
    data_type: Literal["indicators"]
    gender: Literal["全部", "男", "女"]
    metric: str | None = None


class MapLayerColorsRequest(BaseModel):
    colors: dict[str, str]


class DeleteYearRequest(BaseModel):
    year: int = Field(..., ge=1)


def _page_context(request: Request, active: str) -> dict:
    status = load_status()
    return {
        "request": request,
        "active": active,
        "villages": TARGET_VILLAGES,
        "all_villages_label": ALL_VILLAGES_LABEL,
        "processed_years": status.get("processed_years", []),
        "statistics_page_url": STATISTICS_PAGE_URL,
    }


@app.get("/", response_class=HTMLResponse)
async def page_process(request: Request):
    return templates.TemplateResponse(request, "index.html", _page_context(request, "process"))


@app.get("/pyramid", response_class=HTMLResponse)
async def page_pyramid(request: Request):
    return templates.TemplateResponse(request, "pyramid.html", _page_context(request, "pyramid"))


@app.get("/indicators", response_class=HTMLResponse)
async def page_indicators(request: Request):
    ctx = _page_context(request, "indicators")
    ctx["line_chart_metrics"] = LINE_CHART_METRICS
    return templates.TemplateResponse(request, "indicators.html", ctx)


@app.get("/tables", response_class=HTMLResponse)
async def page_tables(request: Request):
    return templates.TemplateResponse(request, "tables.html", _page_context(request, "tables"))


@app.get("/map", response_class=HTMLResponse)
async def page_map(request: Request):
    return templates.TemplateResponse(request, "map.html", _page_context(request, "map"))


@app.get("/api/status")
async def api_status():
    return load_status()


@app.post("/api/process")
async def api_process(body: ProcessRequest):
    years = _parse_process_request(body)

    try:
        return process_years(years, download=body.download)
    except Exception as exc:
        # Keep API errors as JSON so the browser can display a useful message.
        raise HTTPException(status_code=500, detail=f"彙整處理失敗: {exc}") from exc


def _parse_process_request(body: ProcessRequest) -> list[int]:
    years = body.years or []
    if body.years_text:
        try:
            years = parse_years_input(body.years_text)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not years:
        raise HTTPException(status_code=400, detail="請提供至少一個民國年")
    return years


@app.post("/api/jobs/process", status_code=status.HTTP_202_ACCEPTED)
async def api_start_process(body: ProcessRequest):
    years = _parse_process_request(body)
    job = create_job("process")
    submit_job(
        job["id"],
        lambda report: process_years(years, download=body.download, progress=report),
    )
    return job


@app.post("/api/jobs/delete-year", status_code=status.HTTP_202_ACCEPTED)
async def api_start_delete_year(
    body: DeleteYearRequest,
):
    if body.year not in load_status().get("processed_years", []):
        raise HTTPException(status_code=404, detail=f"找不到 {body.year} 年的已彙整資料")
    job = create_job("delete_year")
    submit_job(
        job["id"],
        lambda report: delete_year(body.year, progress=report),
    )
    return job


@app.get("/api/jobs/{job_id}")
async def api_get_job(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="找不到指定的工作")
    return job


@app.get("/api/age-structure")
async def api_age_structure(
    years: list[int] = Query(...),
    villages: list[str] = Query(default=[]),
    gender: Literal["全部", "男", "女"] = "全部",
):
    records = query_age_structure(years, villages, gender)
    if not records:
        raise HTTPException(status_code=404, detail="找不到符合條件的資料，請先執行彙整")
    return {"data": records}


@app.get("/api/indicators")
async def api_indicators(
    years: list[int] = Query(...),
    villages: list[str] = Query(default=[]),
    gender: Literal["全部", "男", "女"] = "全部",
):
    records = query_indicators(years, villages, gender)
    if not records:
        raise HTTPException(status_code=404, detail="找不到符合條件的資料，請先執行彙整")
    return {"data": records}


@app.get("/api/indicators-pivot")
async def api_indicators_pivot(
    years: list[int] = Query(...),
    village: str = Query(default=ALL_VILLAGES_LABEL),
):
    if village not in TARGET_VILLAGES and village != ALL_VILLAGES_LABEL:
        raise HTTPException(status_code=400, detail=f"不支援的里別：{village}")
    result = build_indicators_pivot(years, village)
    if not result["years"]:
        raise HTTPException(status_code=404, detail="找不到符合條件的資料，請先執行彙整")
    return result


@app.get("/api/map-village-data")
async def api_map_village_data(year: int = Query(...)):
    cache = load_status()
    processed = cache.get("processed_years", [])
    if year not in processed:
        raise HTTPException(status_code=404, detail=f"尚無 {year} 年資料，請先執行彙整")
    result = build_map_village_data(year)
    if not result["villages"]:
        raise HTTPException(status_code=404, detail="找不到符合條件的資料，請先執行彙整")
    return result


@app.get("/api/map-custom-layers")
async def api_map_custom_layers():
    return {"layers": load_custom_layers()}


@app.post("/api/map-custom-layers", status_code=201)
async def api_create_map_custom_layer(
    name: str = Form(...),
    chart_type: str = Form(...),
    file: UploadFile = File(...),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="請上傳 .csv 檔案")
    try:
        layer = create_custom_layer(name, chart_type, await file.read())
    except MapLayerValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"layer": layer}


@app.post("/api/map-custom-layers/from-data", status_code=201)
async def api_create_map_custom_layer_from_data(body: MapLayerFromDataRequest):
    try:
        layer = create_custom_layer_from_data(
            body.name,
            body.chart_type,
            body.year,
            body.data_type,
            body.gender,
            body.metric,
        )
    except MapLayerValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except MapLayerDataNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"layer": layer}


@app.delete("/api/map-custom-layers/{layer_id}", status_code=204)
async def api_delete_map_custom_layer(layer_id: str):
    if not delete_custom_layer(layer_id):
        raise HTTPException(status_code=404, detail="找不到指定的共享圖層")
    return Response(status_code=204)


@app.get("/api/v2/map-layers")
async def api_v2_map_layers():
    try:
        return load_catalog_v2()
    except MapLayerValidationError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/v2/map-layers", status_code=201)
async def api_v2_create_map_layer(
    name: str = Form(...),
    chart_type: str = Form(...),
    file: UploadFile = File(...),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="請上傳 .csv 檔案")
    try:
        return {"layer": create_map_layer_v2(name, chart_type, await file.read())}
    except MapLayerValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/v2/map-layers/from-data", status_code=201)
async def api_v2_create_map_layer_from_data(body: MapLayerFromDataRequest):
    try:
        layer = create_map_layer_from_data_v2(
            body.name, body.chart_type, body.year, body.data_type, body.gender, body.metric
        )
    except MapLayerValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except MapLayerDataNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"layer": layer}


@app.patch("/api/v2/map-layers/{layer_id}/colors")
async def api_v2_update_map_layer_colors(layer_id: str, body: MapLayerColorsRequest):
    try:
        return {"layer": update_map_layer_colors_v2(layer_id, body.colors)}
    except MapLayerValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except MapLayerDataNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/v2/map-layers/{layer_id}", status_code=204)
async def api_v2_delete_map_layer(layer_id: str):
    if not delete_custom_layer(layer_id):
        raise HTTPException(status_code=404, detail="找不到指定的共享圖層")
    return Response(status_code=204)


def _ods_file_response(path_str: str | None, label: str) -> FileResponse:
    if not path_str or not Path(path_str).exists():
        raise HTTPException(status_code=404, detail=f"尚無{label} ODS，請先執行彙整")
    path = Path(path_str)
    return FileResponse(
        path=path,
        filename=path.name,
        media_type="application/vnd.oasis.opendocument.spreadsheet",
    )


@app.get("/api/download/ods/age")
async def api_download_ods_age():
    return _ods_file_response(load_status().get("ods_age_path"), "年齡結構")


@app.get("/api/download/ods/indicators")
async def api_download_ods_indicators():
    return _ods_file_response(load_status().get("ods_indicators_path"), "戶政指標")


@app.get("/api/download/ods")
async def api_download_ods_legacy():
    """Legacy endpoint – redirects to age ODS if present."""
    status = load_status()
    path = status.get("ods_age_path") or status.get("ods_path")
    return _ods_file_response(path, "統整")
