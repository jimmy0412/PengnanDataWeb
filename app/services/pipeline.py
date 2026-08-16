"""End-to-end processing pipeline."""

from __future__ import annotations

from pathlib import Path

from app.config import SAMPLES_DIR
from app.services.aggregate import build_annual_indicators, merge_year_cache
from app.services.downloader import download_year_files, fetch_file_links, resolve_local_files
from app.services.export_ods import (
    export_consolidated,
    load_status,
    write_status,
    write_year_cache,
)
from app.services.parse_m11 import parse_m11_monthly
from app.services.parse_m31 import parse_m31_age_structure, parse_m31_elderly_ratio


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
) -> dict:
    errors: list[str] = []
    warnings: list[str] = []

    if download:
        m31_dl, m11_dl, dl_errors = download_year_files(year, links=links)
        errors.extend(dl_errors)
        m31_path = m31_path or m31_dl
        m11_path = m11_path or m11_dl

    m31_path, m11_path = _resolve_paths(year, m31_path, m11_path)

    age_records, w1 = parse_m31_age_structure(m31_path, year)
    warnings.extend(w1)

    elderly, w2 = parse_m31_elderly_ratio(m31_path, year)
    warnings.extend(w2)

    monthly, w3 = parse_m11_monthly(m11_path, year)
    warnings.extend(w3)

    indicators = build_annual_indicators(monthly, elderly, year)
    cache = merge_year_cache(age_records, indicators)
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


def process_years(years: list[int], download: bool = True) -> dict:
    links = fetch_file_links() if download else None
    all_age: list[dict] = []
    all_ind: list[dict] = []
    all_warnings: list[str] = []
    all_errors: list[str] = []
    processed: list[int] = []

    for year in sorted(set(years)):
        try:
            result = process_year(year, links=links, download=download)
            all_age.extend(result["age_records"])
            all_ind.extend(result["indicators"])
            all_warnings.extend(result["warnings"])
            all_errors.extend(result["errors"])
            processed.append(year)
        except Exception as exc:
            all_errors.append(f"{year} 年處理失敗: {exc}")

    ods_age_path = None
    ods_indicators_path = None
    if processed:
        ods_age_path, ods_indicators_path, _ = export_consolidated(
            all_age, all_ind, processed
        )

    status = {
        "processed_years": processed,
        "warnings": all_warnings,
        "errors": all_errors,
        "ods_age_path": str(ods_age_path) if ods_age_path else None,
        "ods_indicators_path": str(ods_indicators_path) if ods_indicators_path else None,
    }
    write_status(status)

    return {
        "processed_years": processed,
        "warnings": all_warnings,
        "errors": all_errors,
        "ods_age_path": str(ods_age_path) if ods_age_path else None,
        "ods_indicators_path": str(ods_indicators_path) if ods_indicators_path else None,
        "record_counts": {
            "age_structure": len(all_age),
            "indicators": len(all_ind),
        },
    }
