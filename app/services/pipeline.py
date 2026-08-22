"""End-to-end processing pipeline."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Callable

from app.config import PROCESSED_DIR, RAW_DIR, SAMPLES_DIR
from app.services.aggregate import build_annual_indicators, merge_year_cache
from app.services.downloader import download_year_files, fetch_file_links, resolve_local_files
from app.services.export_ods import (
    export_consolidated,
    list_cached_years,
    load_status,
    load_year_cache,
    write_status,
    write_year_cache,
)
from app.services.parse_m11 import parse_m11_monthly
from app.services.parse_m31 import parse_m31_age_structure, parse_m31_elderly_ratio
from app.services.map_layers import delete_processed_layers_for_year

ProgressCallback = Callable[[str, int, int], None]


def _notify(
    callback: ProgressCallback | None, stage: str, current: int, total: int
) -> None:
    if callback:
        callback(stage, current, total)


def _resolve_paths(year: int, m31: Path | None, m11: Path | None) -> tuple[Path, Path]:
    if m31 and m11:
        return m31, m11
    local_m31, local_m11 = resolve_local_files(year)
    m31 = m31 or local_m31
    m11 = m11 or local_m11
    if not m31 or not m11:
        sample_m31 = next(SAMPLES_DIR.glob("*-m31*.ods"), None) or next(
            SAMPLES_DIR.glob("*-m31*.xlsx"), None
        )
        sample_m11 = next(SAMPLES_DIR.glob("*-m11*.ods"), None)
        if year == 114 and sample_m31 and sample_m11:
            return sample_m31, sample_m11
        missing = []
        if not m31:
            missing.append("m31")
        if not m11:
            missing.append("m11")
        raise FileNotFoundError(
            f"{year} 年缺少檔案: {', '.join(missing)}。"
            f"請先下載或將檔案放入 data/raw/{year}/"
        )
    return m31, m11


def process_year(
    year: int,
    m31_path: Path | None = None,
    m11_path: Path | None = None,
    links: dict | None = None,
    download: bool = True,
    progress: Callable[[str], None] | None = None,
) -> dict:
    errors: list[str] = []
    warnings: list[str] = []

    if download:
        if progress:
            progress(f"正在下載 {year} 年 m31、m11")
        m31_dl, m11_dl, dl_errors = download_year_files(year, links=links)
        errors.extend(dl_errors)
        m31_path = m31_path or m31_dl
        m11_path = m11_path or m11_dl

    else:
        if progress:
            progress(f"正在尋找 {year} 年本機資料")
    m31_path, m11_path = _resolve_paths(year, m31_path, m11_path)

    if progress:
        progress(f"正在解析 {year} 年 m31 年齡結構")
    age_records, w1 = parse_m31_age_structure(m31_path, year)
    warnings.extend(w1)

    if progress:
        progress(f"正在解析 {year} 年 m31 扶老比")
    elderly, w2 = parse_m31_elderly_ratio(m31_path, year)
    warnings.extend(w2)

    if progress:
        progress(f"正在解析 {year} 年 m11 戶籍動態")
    monthly, w3 = parse_m11_monthly(m11_path, year)
    warnings.extend(w3)

    indicators = build_annual_indicators(monthly, elderly, year)
    cache = merge_year_cache(age_records, indicators)
    if progress:
        progress(f"正在寫入 {year} 年快取")
    write_year_cache(year, cache)

    return {
        "year": year,
        "age_records": age_records,
        "indicators": indicators,
        "warnings": warnings,
        "errors": errors,
        "m31": str(m31_path),
        "m11": str(m11_path),
    }


def _remove_stale_consolidated_files(keep: set[Path] | None = None) -> None:
    keep = {path.resolve() for path in (keep or set())}
    for path in PROCESSED_DIR.glob("consolidated*.ods"):
        if path.resolve() not in keep:
            path.unlink(missing_ok=True)


def rebuild_consolidated(
    *, warnings: list[str] | None = None, errors: list[str] | None = None
) -> dict:
    """Rebuild consolidated exports and status from per-year caches."""
    available_years = list_cached_years()
    all_age: list[dict] = []
    all_ind: list[dict] = []
    for year in available_years:
        cache = load_year_cache(year)
        if not cache:
            continue
        all_age.extend(cache.get("age_structure", []))
        all_ind.extend(cache.get("indicators", []))

    ods_age_path: Path | None = None
    ods_indicators_path: Path | None = None
    if available_years:
        ods_age_path, ods_indicators_path, _ = export_consolidated(
            all_age, all_ind, available_years
        )
        _remove_stale_consolidated_files({ods_age_path, ods_indicators_path})
    else:
        _remove_stale_consolidated_files()

    status = {
        "processed_years": available_years,
        "warnings": warnings or [],
        "errors": errors or [],
        "ods_age_path": str(ods_age_path) if ods_age_path else None,
        "ods_indicators_path": (
            str(ods_indicators_path) if ods_indicators_path else None
        ),
    }
    write_status(status)
    return {
        **status,
        "record_counts": {
            "age_structure": len(all_age),
            "indicators": len(all_ind),
        },
    }


def process_years(
    years: list[int],
    download: bool = True,
    progress: ProgressCallback | None = None,
) -> dict:
    unique_years = sorted(set(years))
    total_steps = len(unique_years) * 5 + 2
    current_step = 0
    _notify(progress, "正在準備政府統計資料來源", current_step, total_steps)
    links = None
    link_error = None
    if download:
        try:
            links = fetch_file_links()
        except Exception as exc:
            # A temporary outage of the source site must not turn the whole API
            # response into a plain-text 500.  The year loop below can still
            # fall back to files already present in data/raw/{year}.
            links = {}
            link_error = f"無法讀取政府統計頁下載連結: {exc}"
    all_age: list[dict] = []
    all_ind: list[dict] = []
    all_warnings: list[str] = [link_error] if link_error else []
    all_errors: list[str] = []
    processed: list[int] = []

    current_step += 1
    _notify(progress, "已取得資料來源，準備逐年處理", current_step, total_steps)

    for year in unique_years:
        year_start_step = current_step

        def report_year(stage: str) -> None:
            nonlocal current_step
            current_step += 1
            _notify(progress, stage, current_step, total_steps)

        try:
            process_kwargs = {
                "links": links,
                "download": download and link_error is None,
            }
            if progress:
                process_kwargs["progress"] = report_year
            result = process_year(year, **process_kwargs)
            all_age.extend(result["age_records"])
            all_ind.extend(result["indicators"])
            all_warnings.extend(result["warnings"])
            all_errors.extend(result["errors"])
            processed.append(year)
        except Exception as exc:
            all_errors.append(f"{year} 年處理失敗: {exc}")
            # Keep the overall estimate moving if this year failed early.
            completed_for_year = current_step - year_start_step
            current_step += 5 - completed_for_year
            _notify(progress, f"{year} 年處理失敗，繼續下一年份", current_step, total_steps)

    if processed:
        _notify(progress, "正在重建統整 ODS", total_steps - 1, total_steps)
        rebuilt = rebuild_consolidated(
            warnings=all_warnings,
            errors=all_errors,
        )
    else:
        previous_status = load_status()
        rebuilt = {
            **previous_status,
            "warnings": all_warnings,
            "errors": all_errors,
            "record_counts": {"age_structure": 0, "indicators": 0},
        }
        write_status({key: value for key, value in rebuilt.items() if key != "record_counts"})

    _notify(progress, "彙整完成", total_steps, total_steps)
    return {
        "processed_years": rebuilt.get("processed_years", []),
        "processed_this_run": processed,
        "warnings": all_warnings,
        "errors": all_errors,
        "ods_age_path": rebuilt.get("ods_age_path"),
        "ods_indicators_path": rebuilt.get("ods_indicators_path"),
        "record_counts": rebuilt["record_counts"],
    }


def delete_year(year: int, progress: ProgressCallback | None = None) -> dict:
    """Delete all stored data derived from a year and rebuild exports."""
    if year not in list_cached_years():
        raise FileNotFoundError(f"找不到 {year} 年的已彙整資料")

    total_steps = 4
    _notify(progress, f"正在刪除 {year} 年原始資料", 0, total_steps)
    raw_dir = RAW_DIR / str(year)
    if raw_dir.exists():
        shutil.rmtree(raw_dir)

    _notify(progress, f"正在刪除 {year} 年快取", 1, total_steps)
    (PROCESSED_DIR / f"cache_{year}.json").unlink(missing_ok=True)

    _notify(progress, f"正在刪除 {year} 年衍生地圖圖層", 2, total_steps)
    removed_layers = delete_processed_layers_for_year(year)

    _notify(progress, "正在重建統整 ODS", 3, total_steps)
    rebuilt = rebuild_consolidated()
    _notify(progress, "刪除完成", 4, total_steps)
    return {
        "deleted_year": year,
        "processed_years": rebuilt["processed_years"],
        "removed_map_layers": removed_layers,
        "ods_age_path": rebuilt["ods_age_path"],
        "ods_indicators_path": rebuilt["ods_indicators_path"],
    }
