"""Versioned map-layer catalog with V1 compatibility adapters."""
from __future__ import annotations

import csv, io, json, math, os, re, shutil, threading
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.config import MAP_LAYERS_CATALOG_FILE, MAP_LAYERS_DIR, TARGET_VILLAGES
from app.services.query_data import query_indicators

CHART_TYPES = {"bar", "pie", "donut", "choropleth"}
DATA_TYPES = {"indicators"}
GENDERS = {"全部", "男", "女"}
INDICATOR_METRICS = {"總人口", "扶老比", "出生率", "自然增加率", "年出生", "年死亡"}
SERIES_COLORS = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#F0E442", "#6F4E7C", "#8C564B", "#2F4B7C", "#A05195", "#665191", "#FF7C43", "#1B998B", "#B56576", "#4C78A8", "#F58518", "#54A24B", "#E45756", "#72B7B2"]
CHOROPLETH_COLORS = ["#ffffb2", "#fecc5c", "#fd8d3c", "#f03b20", "#bd0026"]
_LOCK = threading.RLock()

class MapLayerValidationError(ValueError): pass
class MapLayerDataNotFoundError(LookupError): pass

def _now(): return datetime.now(timezone.utc).isoformat()
def _safe_filename(name): return re.sub(r"[^A-Za-z0-9_-]+", "-", name).strip("-") or "map-layer"
def _series_id(name, index):
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", name).strip("-").lower()
    return f"s{index + 1}-{slug}" if slug else f"series-{index + 1}"

def _validate_definition(name, chart_type):
    name = name.strip()
    if not name: raise MapLayerValidationError("請提供圖層名稱")
    if len(name) > 100: raise MapLayerValidationError("圖層名稱不可超過 100 個字元")
    if chart_type not in CHART_TYPES: raise MapLayerValidationError("圖層類型必須為 bar、pie、donut 或 choropleth")
    return name

def _validate_names(names):
    names = [str(name).strip() for name in names]
    if not names or any(not name for name in names): raise MapLayerValidationError("至少需要一個非空白系列名稱")
    if len(set(names)) != len(names): raise MapLayerValidationError("系列名稱不可重複")
    if any(len(name) > 100 for name in names): raise MapLayerValidationError("系列名稱不可超過 100 個字元")
    return names

def _build_layer(name, chart_type, names, values, *, source, layer_id=None, created_at=None):
    name, names = _validate_definition(name, chart_type), _validate_names(names)
    if chart_type == "choropleth" and len(names) != 1: raise MapLayerValidationError("面量圖只能包含一個數值系列")
    series = [{"id": _series_id(label, i), "name": label, "color": SERIES_COLORS[i % len(SERIES_COLORS)]} for i, label in enumerate(names)]
    ids = {item["name"]: item["id"] for item in series}
    normalized = {}
    for village, row in values.items():
        if village not in TARGET_VILLAGES: raise MapLayerValidationError(f"不支援的里別：{village}")
        normalized[village] = {}
        for label in names:
            try: number = float(row[label])
            except (KeyError, TypeError, ValueError) as exc: raise MapLayerValidationError(f"{village} 的「{label}」必須為數值") from exc
            if not math.isfinite(number): raise MapLayerValidationError(f"{village} 的「{label}」必須為有限數值")
            if chart_type in {"pie", "donut"} and number < 0: raise MapLayerValidationError("圓餅圖與甜甜圈圖不可包含負值")
            normalized[village][ids[label]] = number
    visualization = ({"type": "choropleth", "scale": "equal_interval", "classes": 5, "palette": CHOROPLETH_COLORS}
                     if chart_type == "choropleth" else {"type": chart_type, "scale": "global"})
    return {"id": layer_id or uuid4().hex, "name": name, "kind": "choropleth" if chart_type == "choropleth" else "chart", "created_at": created_at or _now(), "visualization": visualization, "series": series, "values": normalized, "source": source}

def _validate_layer(layer):
    required = {"id", "name", "kind", "created_at", "visualization", "series", "values", "source"}
    if not isinstance(layer, dict) or not required <= set(layer): raise MapLayerValidationError("catalog 圖層缺少必要欄位")
    if not isinstance(layer["id"], str) or not layer["id"].strip(): raise MapLayerValidationError("圖層 id 無效")
    if not isinstance(layer["name"], str) or not isinstance(layer["created_at"], str) or not layer["created_at"].strip(): raise MapLayerValidationError("圖層名稱或建立時間無效")
    if layer["kind"] not in {"chart", "choropleth"} or not isinstance(layer["source"], dict): raise MapLayerValidationError("圖層種類或來源格式無效")
    visual = layer["visualization"]
    if not isinstance(visual, dict): raise MapLayerValidationError("圖層視覺化格式無效")
    chart_type = visual.get("type"); _validate_definition(str(layer["name"]), chart_type)
    if chart_type == "choropleth":
        if layer["kind"] != "choropleth" or visual.get("scale") != "equal_interval" or visual.get("classes") != 5: raise MapLayerValidationError("面量圖必須使用 5 級等距尺度")
        palette = visual.get("palette")
        if not isinstance(palette, list) or len(palette) != 5 or any(not isinstance(color, str) or not re.fullmatch(r"#[0-9A-Fa-f]{6}", color) for color in palette): raise MapLayerValidationError("面量圖色盤格式無效")
    elif layer["kind"] != "chart" or visual.get("scale") != "global":
        raise MapLayerValidationError("圖表圖層尺度必須為 global")
    if not isinstance(layer["series"], list) or not layer["series"]: raise MapLayerValidationError("圖層至少需要一個系列")
    ids = set()
    for item in layer["series"]:
        if not isinstance(item, dict) or not all(isinstance(item.get(k), str) and item[k].strip() for k in ("id", "name", "color")): raise MapLayerValidationError("系列格式無效")
        if item["id"] in ids: raise MapLayerValidationError("系列 id 不可重複")
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", item["color"]): raise MapLayerValidationError("系列色彩格式無效")
        ids.add(item["id"])
    if chart_type == "choropleth" and len(ids) != 1: raise MapLayerValidationError("面量圖只能包含一個數值系列")
    if not isinstance(layer["values"], dict): raise MapLayerValidationError("圖層數值格式無效")
    for village, row in layer["values"].items():
        if village not in TARGET_VILLAGES or not isinstance(row, dict) or set(row) != ids: raise MapLayerValidationError("里別或系列數值不完整")
        for value in row.values():
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value): raise MapLayerValidationError("圖層數值必須為有限數值")
            if chart_type in {"pie", "donut"} and value < 0: raise MapLayerValidationError("圓餅圖與甜甜圈圖不可包含負值")
    return layer

def validate_catalog(catalog):
    if not isinstance(catalog, dict) or catalog.get("schema_version") != 2 or not isinstance(catalog.get("layers"), list): raise MapLayerValidationError("catalog 必須使用 schema_version 2")
    seen = set()
    for layer in catalog["layers"]:
        _validate_layer(layer)
        if layer["id"] in seen: raise MapLayerValidationError("圖層 id 不可重複")
        seen.add(layer["id"])
    return catalog

def _atomic_write(catalog):
    validate_catalog(catalog); MAP_LAYERS_DIR.mkdir(parents=True, exist_ok=True)
    temporary = MAP_LAYERS_DIR / f".{MAP_LAYERS_CATALOG_FILE.name}.{uuid4().hex}.tmp"
    try:
        with temporary.open("w", encoding="utf-8") as output:
            json.dump(catalog, output, ensure_ascii=False, indent=2, allow_nan=False); output.flush(); os.fsync(output.fileno())
        with temporary.open(encoding="utf-8") as check: validate_catalog(json.load(check))
        os.replace(temporary, MAP_LAYERS_CATALOG_FILE)
    finally: temporary.unlink(missing_ok=True)

def _v1_to_v2(layer):
    source_meta = layer.get("source_meta") if isinstance(layer.get("source_meta"), dict) else {}
    source = {"type": layer.get("source_type", "csv"), **source_meta}
    if isinstance(layer.get("source_file"), str): source["file"] = layer["source_file"]
    # Very early catalogs may contain metadata-only records. Preserve them
    # with a placeholder series instead of silently dropping user data.
    names = layer.get("series") or ["數值"]
    return _build_layer(str(layer.get("name", "舊圖層")), str(layer.get("chart_type", "bar")), names, layer.get("values") or {}, source=source, layer_id=str(layer.get("id") or uuid4().hex), created_at=str(layer.get("created_at") or _now()))

def load_catalog_v2():
    with _LOCK:
        if not MAP_LAYERS_CATALOG_FILE.exists(): return {"schema_version": 2, "layers": []}
        try:
            with MAP_LAYERS_CATALOG_FILE.open(encoding="utf-8") as source: data = json.load(source)
        except (OSError, json.JSONDecodeError) as exc: raise MapLayerValidationError(f"無法讀取圖層 catalog：{exc}") from exc
        if isinstance(data, list):
            migrated = {"schema_version": 2, "layers": [_v1_to_v2(layer) for layer in data if isinstance(layer, dict)]}; validate_catalog(migrated)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
            shutil.copy2(MAP_LAYERS_CATALOG_FILE, MAP_LAYERS_DIR / f"catalog.v1.{stamp}.bak.json")
            _atomic_write(migrated); return migrated
        return validate_catalog(data)

def _v2_to_v1(layer):
    source = layer["source"]; names = {item["id"]: item["name"] for item in layer["series"]}
    result = {"id": layer["id"], "name": layer["name"], "chart_type": layer["visualization"]["type"], "series": [item["name"] for item in layer["series"]], "values": {v: {names[k]: n for k, n in row.items()} for v, row in layer["values"].items()}, "created_at": layer["created_at"], "source_type": source.get("type", "csv"), "source_meta": {k: v for k, v in source.items() if k not in {"type", "file"}}}
    if isinstance(source.get("file"), str): result["source_file"] = source["file"]
    return result

def load_custom_layers(): return [_v2_to_v1(layer) for layer in load_catalog_v2()["layers"]]

def _persist(layer):
    with _LOCK:
        catalog = load_catalog_v2(); _atomic_write({"schema_version": 2, "layers": [*catalog["layers"], layer]})
    return layer

def _parse_csv(name, chart_type, content):
    _validate_definition(name, chart_type)
    if not content: raise MapLayerValidationError("CSV 檔案不可為空")
    try: text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc: raise MapLayerValidationError("CSV 必須為 UTF-8 編碼") from exc
    try:
        reader = csv.DictReader(io.StringIO(text)); headers = reader.fieldnames or []
        if "里" not in headers: raise MapLayerValidationError("CSV 必須包含「里」欄位")
        if any(not h or not h.strip() for h in headers) or len(set(headers)) != len(headers): raise MapLayerValidationError("CSV 欄位名稱不可空白或重複")
        series = _validate_names([h for h in headers if h != "里"])
        if chart_type == "choropleth" and len(series) != 1: raise MapLayerValidationError("面量圖 CSV 必須只有「里」及一個數值欄位")
        values = {}
        for line, row in enumerate(reader, 2):
            village = (row.get("里") or "").strip()
            if not village: raise MapLayerValidationError(f"第 {line} 列缺少里名")
            if village not in TARGET_VILLAGES: raise MapLayerValidationError(f"第 {line} 列的里別不支援：{village}")
            if village in values: raise MapLayerValidationError(f"里別不可重複：{village}")
            values[village] = {}
            for column in series:
                raw = (row.get(column) or "").strip()
                if not raw: raise MapLayerValidationError(f"第 {line} 列「{column}」不可空白")
                try: number = float(raw)
                except ValueError as exc: raise MapLayerValidationError(f"第 {line} 列「{column}」必須為數值") from exc
                if not math.isfinite(number): raise MapLayerValidationError(f"第 {line} 列「{column}」必須為有限數值")
                values[village][column] = number
    except csv.Error as exc: raise MapLayerValidationError("CSV 格式無法讀取") from exc
    return series, values

def create_map_layer_v2(name, chart_type, csv_bytes):
    name = _validate_definition(name, chart_type); series, values = _parse_csv(name, chart_type, csv_bytes); layer_id = uuid4().hex
    MAP_LAYERS_DIR.mkdir(parents=True, exist_ok=True); filename = f"{_safe_filename(name)}-{layer_id}.csv"; path = MAP_LAYERS_DIR / filename; path.write_bytes(csv_bytes)
    try: return _persist(_build_layer(name, chart_type, series, values, source={"type": "csv", "file": filename}, layer_id=layer_id))
    except Exception: path.unlink(missing_ok=True); raise

def create_custom_layer(name, chart_type, csv_bytes): return _v2_to_v1(create_map_layer_v2(name, chart_type, csv_bytes))

def _processed_values(year, data_type, gender, metric):
    if data_type not in DATA_TYPES: raise MapLayerValidationError("資料類型必須為 indicators")
    if gender not in GENDERS: raise MapLayerValidationError("性別必須為全部、男或女")
    if metric not in INDICATOR_METRICS: raise MapLayerValidationError("請選擇有效的年度指標")
    rows = query_indicators([year], TARGET_VILLAGES, gender); series = [metric]; by_village = {row["里"]: row for row in rows if row.get("年份") == year}; raw = {v: {metric: by_village.get(v, {}).get(metric)} for v in TARGET_VILLAGES}
    values = {}
    for village in TARGET_VILLAGES:
        values[village] = {}
        for label in series:
            try: number = float(raw[village][label])
            except (KeyError, TypeError, ValueError) as exc: raise MapLayerDataNotFoundError(f"{year} 年的 {village} 資料不完整") from exc
            if not math.isfinite(number): raise MapLayerDataNotFoundError(f"{year} 年的 {village} 資料不是有限數值")
            values[village][label] = number
    return series, values

def create_map_layer_from_data_v2(name, chart_type, year, data_type, gender, metric=None):
    name = _validate_definition(name, chart_type)
    series, values = _processed_values(year, data_type, gender, metric)
    units = {"扶老比": "%", "出生率": "‰", "自然增加率": "‰", "總人口": "人", "年出生": "人", "年死亡": "人"}
    source = {"type": "processed_data", "year": year, "data_type": data_type, "gender": gender, "metric": metric if data_type == "indicators" else None, "unit": units.get(metric, "人")}
    return _persist(_build_layer(name, chart_type, series, values, source=source))

def create_custom_layer_from_data(name, chart_type, year, data_type, gender, metric=None): return _v2_to_v1(create_map_layer_from_data_v2(name, chart_type, year, data_type, gender, metric))

def update_map_layer_colors_v2(layer_id, colors):
    if not isinstance(colors, dict) or not colors: raise MapLayerValidationError("請提供至少一個系列顏色")
    if any(not isinstance(series_id, str) or not series_id.strip() for series_id in colors): raise MapLayerValidationError("系列 id 無效")
    if any(not isinstance(color, str) or not re.fullmatch(r"#[0-9A-Fa-f]{6}", color) for color in colors.values()): raise MapLayerValidationError("系列色彩必須為 #RRGGBB 格式")
    with _LOCK:
        catalog = load_catalog_v2(); target = next((x for x in catalog["layers"] if x["id"] == layer_id), None)
        if target is None: raise MapLayerDataNotFoundError("找不到指定的共享圖層")
        if target["visualization"]["type"] not in {"bar", "pie", "donut"}: raise MapLayerValidationError("只有長條圖、圓餅圖或甜甜圈圖可以修改系列顏色")
        known_ids = {item["id"] for item in target["series"]}
        unknown = set(colors) - known_ids
        if unknown: raise MapLayerValidationError(f"找不到指定的系列：{sorted(unknown)[0]}")
        for item in target["series"]:
            if item["id"] in colors: item["color"] = colors[item["id"]]
        _atomic_write(catalog)
        return target

def delete_custom_layer(layer_id):
    with _LOCK:
        catalog = load_catalog_v2(); target = next((x for x in catalog["layers"] if x["id"] == layer_id), None)
        if target is None: return False
        _atomic_write({"schema_version": 2, "layers": [x for x in catalog["layers"] if x["id"] != layer_id]})
    filename = target.get("source", {}).get("file")
    if isinstance(filename, str) and filename and Path(filename).name == filename: (MAP_LAYERS_DIR / filename).unlink(missing_ok=True)
    return True

def delete_processed_layers_for_year(year):
    # Year deletion is also used by installations that have never opened the
    # V2 map. Keep such a legacy catalog in V1 until a V2 read explicitly
    # performs the backed-up migration.
    legacy = None
    if MAP_LAYERS_CATALOG_FILE.exists():
        try:
            with MAP_LAYERS_CATALOG_FILE.open(encoding="utf-8") as source: candidate = json.load(source)
            if isinstance(candidate, list): legacy = candidate
        except (OSError, json.JSONDecodeError):
            pass
    if legacy is not None:
        kept = [x for x in legacy if not (x.get("source_type") == "processed_data" and (x.get("source_meta") or {}).get("year") == year)]
        removed = len(legacy) - len(kept)
        if removed:
            MAP_LAYERS_DIR.mkdir(parents=True, exist_ok=True)
            temporary = MAP_LAYERS_DIR / f".{MAP_LAYERS_CATALOG_FILE.name}.{uuid4().hex}.tmp"
            try:
                with temporary.open("w", encoding="utf-8") as output:
                    json.dump(kept, output, ensure_ascii=False, indent=2); output.flush(); os.fsync(output.fileno())
                os.replace(temporary, MAP_LAYERS_CATALOG_FILE)
            finally: temporary.unlink(missing_ok=True)
        return removed
    with _LOCK:
        catalog = load_catalog_v2(); kept = [x for x in catalog["layers"] if not (x.get("source", {}).get("type") == "processed_data" and x.get("source", {}).get("year") == year)]; removed = len(catalog["layers"]) - len(kept)
        if removed: _atomic_write({"schema_version": 2, "layers": kept})
        return removed
