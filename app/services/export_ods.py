"""Export consolidated ODS and per-year JSON cache."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from app.config import PROCESSED_DIR


def export_consolidated(
    age_records: list[dict],
    indicator_records: list[dict],
    years: list[int],
) -> tuple[Path, Path, str]:
    """Write separate ODS files for age structure and household indicators."""
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    label = f"{min(years)}-{max(years)}" if len(years) > 1 else str(years[0])
    age_path = PROCESSED_DIR / f"consolidated_age_{label}.ods"
    indicators_path = PROCESSED_DIR / f"consolidated_indicators_{label}.ods"

    with pd.ExcelWriter(age_path, engine="odf") as writer:
        pd.DataFrame(age_records).to_excel(
            writer, sheet_name="年齡結構_五年齡組", index=False
        )
    with pd.ExcelWriter(indicators_path, engine="odf") as writer:
        pd.DataFrame(indicator_records).to_excel(writer, sheet_name="年度指標", index=False)

    return age_path, indicators_path, label


def write_year_cache(year: int, cache: dict) -> Path:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    path = PROCESSED_DIR / f"cache_{year}.json"
    with path.open("w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    return path


def write_status(status: dict) -> Path:
    from app.config import STATUS_FILE

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with STATUS_FILE.open("w", encoding="utf-8") as f:
        json.dump(status, f, ensure_ascii=False, indent=2)
    return STATUS_FILE


def load_status() -> dict:
    from app.config import STATUS_FILE

    if not STATUS_FILE.exists():
        return {
            "processed_years": [],
            "warnings": [],
            "errors": [],
            "ods_age_path": None,
            "ods_indicators_path": None,
        }
    with STATUS_FILE.open(encoding="utf-8") as f:
        data = json.load(f)
    # backward compatibility
    if data.get("ods_path") and not data.get("ods_age_path"):
        data["ods_age_path"] = data["ods_path"]
    return data


def load_year_cache(year: int) -> dict | None:
    path = PROCESSED_DIR / f"cache_{year}.json"
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as f:
        return json.load(f)
