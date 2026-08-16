"""Parse m31 age-by-gender population files."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from app.config import AGE_GROUPS, GENDER_LABELS, TARGET_VILLAGES
from app.services.parse_utils import (
    extract_village_blocks,
    find_age_header_row,
    parse_age_columns,
    pick_december_sheet,
    read_excel_file,
    read_sheet,
    safe_int,
)


def _sum_age_range(row: pd.Series, age_cols: dict[int, int], lo: int, hi: int) -> int:
    total = 0
    for idx, age in age_cols.items():
        if lo <= age <= hi:
            total += safe_int(row.iloc[idx])
    return total


def parse_m31_age_structure(
    path: Path,
    year: int,
    month_sheet: str | None = None,
) -> tuple[list[dict], list[str]]:
    """
    Return (records, warnings).
    Each record: {year, village, gender, age_group, population}
    """
    warnings: list[str] = []
    xl = read_excel_file(path)
    if month_sheet:
        sheet = month_sheet
    else:
        sheet, sheet_warnings = pick_december_sheet(xl, year)
        warnings.extend(sheet_warnings)

    df = read_sheet(path, sheet)
    if len(df) < 4:
        raise ValueError(f"Sheet {sheet} has too few rows")

    header_row_idx = find_age_header_row(df)
    age_cols = parse_age_columns(df.iloc[header_row_idx])
    if not age_cols:
        raise ValueError(f"Could not find age columns in {path.name} / {sheet}")

    blocks = extract_village_blocks(df.iloc[header_row_idx + 1 :])
    records: list[dict] = []

    for village in TARGET_VILLAGES:
        genders = blocks.get(village, {})
        if not genders:
            warnings.append(f"{year} 年 {village} 在 m31 中找不到資料")
            continue

        for gender_key, row in genders.items():
            gender = GENDER_LABELS.get(gender_key, gender_key)
            for group in AGE_GROUPS:
                lo, hi = [int(x) for x in group.split("–")]
                pop = _sum_age_range(row, age_cols, lo, hi)
                records.append(
                    {
                        "年份": year,
                        "里": village,
                        "性別": gender,
                        "年齡組": group,
                        "人口數": pop,
                    }
                )

    return records, warnings


def parse_m31_elderly_ratio(
    path: Path,
    year: int,
    month_sheet: str | None = None,
) -> tuple[list[dict], list[str]]:
    """
    Compute 扶老比 per village/gender from m31 December data.
    Returns records with keys: 年份, 里, 性別, 扶老比
    """
    warnings: list[str] = []
    xl = read_excel_file(path)
    if month_sheet:
        sheet = month_sheet
    else:
        sheet, sheet_warnings = pick_december_sheet(xl, year)
        warnings.extend(sheet_warnings)

    df = read_sheet(path, sheet)
    header_row_idx = find_age_header_row(df)
    age_cols = parse_age_columns(df.iloc[header_row_idx])
    blocks = extract_village_blocks(df.iloc[header_row_idx + 1 :])
    records: list[dict] = []

    for village in TARGET_VILLAGES:
        genders = blocks.get(village, {})
        if not genders:
            continue
        for gender_key, row in genders.items():
            pop_65 = _sum_age_range(row, age_cols, 65, 120)
            pop_15_64 = _sum_age_range(row, age_cols, 15, 64)
            ratio = (pop_65 / pop_15_64 * 100) if pop_15_64 > 0 else None
            records.append(
                {
                    "年份": year,
                    "里": village,
                    "性別": GENDER_LABELS.get(gender_key, gender_key),
                    "扶老比": round(ratio, 2) if ratio is not None else None,
                }
            )

    return records, warnings
