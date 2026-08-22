"""Shared, immutable custom map-layer catalog."""

from __future__ import annotations

import csv
import io
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.config import AGE_GROUPS, MAP_LAYERS_CATALOG_FILE, MAP_LAYERS_DIR, TARGET_VILLAGES
from app.services.query_data import query_age_structure, query_indicators

CHART_TYPES = {"bar", "pie", "donut"}
DATA_TYPES = {"indicators", "age"}
GENDERS = {"全部", "男", "女"}
INDICATOR_METRICS = {"總人口", "扶老比", "出生率", "自然增加率", "年出生", "年死亡"}


class MapLayerValidationError(ValueError):
    """Raised when an uploaded CSV cannot be used as a map layer."""


class MapLayerDataNotFoundError(LookupError):
    """Raised when processed data cannot provide a complete map layer."""


def load_custom_layers() -> list[dict]:
    if not MAP_LAYERS_CATALOG_FILE.exists():
        return []
    with MAP_LAYERS_CATALOG_FILE.open(encoding="utf-8") as catalog:
        data = json.load(catalog)
    if not isinstance(data, list):
        return []
    return [
        {
            **layer,
            "source_type": layer.get("source_type", "csv"),
            "source_meta": layer.get("source_meta") or {},
        }
        for layer in data
        if isinstance(layer, dict)
    ]


def _write_catalog(layers: list[dict]) -> None:
    MAP_LAYERS_DIR.mkdir(parents=True, exist_ok=True)
    with MAP_LAYERS_CATALOG_FILE.open("w", encoding="utf-8") as catalog:
        json.dump(layers, catalog, ensure_ascii=False, indent=2)


def _safe_filename(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "-", name).strip("-") or "map-layer"


def _validate_definition(name: str, chart_type: str) -> str:
    normalized_name = name.strip()
    if not normalized_name:
        raise MapLayerValidationError("請提供圖層名稱")
    if len(normalized_name) > 100:
        raise MapLayerValidationError("圖層名稱不可超過 100 個字元")
    if chart_type not in CHART_TYPES:
        raise MapLayerValidationError("圖表類型必須為 bar、pie 或 donut")
    return normalized_name


def _persist_layer(
    name: str,
    chart_type: str,
    series: list[str],
    values: dict[str, dict[str, float]],
    *,
    source_type: str,
    source_meta: dict | None = None,
    source_file: str | None = None,
    layer_id: str | None = None,
) -> dict:
    layer = {
        "id": layer_id or uuid4().hex,
        "name": name,
        "chart_type": chart_type,
        "series": series,
        "values": values,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_type": source_type,
        "source_meta": source_meta or {},
    }
    if source_file:
        layer["source_file"] = source_file
    layers = load_custom_layers()
    layers.append(layer)
    _write_catalog(layers)
    return layer


def create_custom_layer(name: str, chart_type: str, csv_bytes: bytes) -> dict:
    name = _validate_definition(name, chart_type)
    if not csv_bytes:
        raise MapLayerValidationError("CSV 檔案不可為空")

    try:
        text = csv_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise MapLayerValidationError("CSV 必須為 UTF-8 編碼") from exc

    try:
        reader = csv.DictReader(io.StringIO(text))
        headers = reader.fieldnames or []
        if "里" not in headers:
            raise MapLayerValidationError("CSV 必須包含「里」欄位")
        if any(not header for header in headers) or len(set(headers)) != len(headers):
            raise MapLayerValidationError("CSV 欄位名稱不可空白或重複")
        series = [header for header in headers if header and header != "里"]
        if not series:
            raise MapLayerValidationError("CSV 至少要有一個數值欄位")

        values: dict[str, dict[str, float]] = {}
        for row_number, row in enumerate(reader, start=2):
            village = (row.get("里") or "").strip()
            if not village:
                raise MapLayerValidationError(f"第 {row_number} 列缺少里名")
            if village not in TARGET_VILLAGES:
                raise MapLayerValidationError(f"第 {row_number} 列的里別不支援：{village}")
            if village in values:
                raise MapLayerValidationError(f"里別不可重複：{village}")
            normalized: dict[str, float] = {}
            for column in series:
                raw = (row.get(column) or "").strip()
                if not raw:
                    raise MapLayerValidationError(f"第 {row_number} 列「{column}」不可空白")
                try:
                    normalized[column] = float(raw)
                except ValueError as exc:
                    raise MapLayerValidationError(
                        f"第 {row_number} 列「{column}」必須為數值"
                    ) from exc
                if not math.isfinite(normalized[column]):
                    raise MapLayerValidationError(f"第 {row_number} 列「{column}」必須為有限數值")
            values[village] = normalized
    except csv.Error as exc:
        raise MapLayerValidationError("CSV 格式無法讀取") from exc

    layer_id = uuid4().hex
    MAP_LAYERS_DIR.mkdir(parents=True, exist_ok=True)
    source_path = MAP_LAYERS_DIR / f"{_safe_filename(name)}-{layer_id}.csv"
    source_path.write_bytes(csv_bytes)
    try:
        layer = _persist_layer(
            name,
            chart_type,
            series,
            values,
            source_type="csv",
            source_file=source_path.name,
            layer_id=layer_id,
        )
    except Exception:
        source_path.unlink(missing_ok=True)
        raise
    return layer


def create_custom_layer_from_data(
    name: str,
    chart_type: str,
    year: int,
    data_type: str,
    gender: str,
    metric: str | None = None,
) -> dict:
    """Create an immutable shared layer snapshot from processed table data."""
    name = _validate_definition(name, chart_type)
    if data_type not in DATA_TYPES:
        raise MapLayerValidationError("資料類型必須為 indicators 或 age")
    if gender not in GENDERS:
        raise MapLayerValidationError("性別必須為全部、男或女")

    if data_type == "indicators":
        if metric not in INDICATOR_METRICS:
            raise MapLayerValidationError("請選擇有效的年度指標")
        rows = query_indicators([year], TARGET_VILLAGES, gender)
        series = [metric]
        row_by_village = {row["里"]: row for row in rows if row.get("年份") == year}
        values = {
            village: {metric: row_by_village.get(village, {}).get(metric)}
            for village in TARGET_VILLAGES
        }
    else:
        rows = query_age_structure([year], TARGET_VILLAGES, gender)
        series = list(AGE_GROUPS)
        values = {village: {} for village in TARGET_VILLAGES}
        for row in rows:
            village = row.get("里")
            age_group = row.get("年齡組")
            if village in values and age_group in AGE_GROUPS and row.get("年份") == year:
                values[village][age_group] = row.get("人口數")

    normalized: dict[str, dict[str, float]] = {}
    for village in TARGET_VILLAGES:
        village_values = values.get(village, {})
        if any(series_name not in village_values for series_name in series):
            raise MapLayerDataNotFoundError(f"{year} 年的 {village} 資料不完整")
        normalized[village] = {}
        for series_name in series:
            raw = village_values[series_name]
            if raw is None:
                raise MapLayerDataNotFoundError(f"{year} 年的 {village} 資料不完整")
            try:
                number = float(raw)
            except (TypeError, ValueError) as exc:
                raise MapLayerDataNotFoundError(f"{year} 年的 {village} 資料不是有效數值") from exc
            if not math.isfinite(number):
                raise MapLayerDataNotFoundError(f"{year} 年的 {village} 資料不是有限數值")
            normalized[village][series_name] = number

    return _persist_layer(
        name,
        chart_type,
        series,
        normalized,
        source_type="processed_data",
        source_meta={
            "year": year,
            "data_type": data_type,
            "gender": gender,
            "metric": metric if data_type == "indicators" else None,
        },
    )


def delete_custom_layer(layer_id: str) -> bool:
    """Remove a shared layer and its catalog-owned CSV source, if present."""
    layers = load_custom_layers()
    target = next((layer for layer in layers if layer.get("id") == layer_id), None)
    if target is None:
        return False

    _write_catalog([layer for layer in layers if layer.get("id") != layer_id])
    source_file = target.get("source_file")
    if isinstance(source_file, str) and source_file and Path(source_file).name == source_file:
        (MAP_LAYERS_DIR / source_file).unlink(missing_ok=True)
    return True


def delete_processed_layers_for_year(year: int) -> int:
    """Remove immutable map snapshots derived from one processed year."""
    layers = load_custom_layers()
    kept: list[dict] = []
    removed = 0
    for layer in layers:
        source_meta = layer.get("source_meta") or {}
        if (
            layer.get("source_type") == "processed_data"
            and source_meta.get("year") == year
        ):
            removed += 1
            continue
        kept.append(layer)
    if removed:
        _write_catalog(kept)
    return removed
