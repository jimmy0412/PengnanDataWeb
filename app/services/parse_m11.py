"""Parse m11 household registration dynamic statistics."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from app.config import GENDER_LABELS, TARGET_VILLAGES
from app.services.parse_utils import (
    cell_str,
    extract_village_blocks,
    find_year_sheets,
    read_excel_file,
    read_sheet,
    safe_int,
)


def _find_header_row(df: pd.DataFrame) -> int:
    for i in range(min(5, len(df))):
        row = [cell_str(v) for v in df.iloc[i]]
        if "人口數" in row and "區域別" in row:
            return i
    raise ValueError("Could not find header row with 人口數")


def _col_index(header_row: pd.Series, name: str) -> int | None:
    for idx, raw in enumerate(header_row):
        if cell_str(raw) == name:
            return idx
    return None


def parse_m11_monthly(path: Path, year: int) -> tuple[list[dict], list[str]]:
    """
    Parse all monthly sheets for a year.
    Returns monthly records:
    {year, month, village, gender, population, births, deaths}
    """
    warnings: list[str] = []
    xl = read_excel_file(path)
    sheets = find_year_sheets(xl, year)
    if not sheets:
        raise ValueError(f"No monthly sheets for year {year} in {path.name}")

    monthly: list[dict] = []

    for sheet in sheets:
        month_m = __import__("re").search(r"年(\d{1,2})月", sheet)
        month = int(month_m.group(1)) if month_m else 0

        df = read_sheet(path, sheet)
        header_idx = _find_header_row(df)
        header = df.iloc[header_idx]
        pop_col = _col_index(header, "人口數")
        birth_col = _col_index(header, "嬰兒出生總數_合計")
        death_col = _col_index(header, "死亡人數")
        if pop_col is None or birth_col is None or death_col is None:
            raise ValueError(f"Missing columns in {sheet}")

        blocks = extract_village_blocks(df.iloc[header_idx + 1 :], gender_col=4)
        for village in TARGET_VILLAGES:
            genders = blocks.get(village, {})
            if not genders:
                if month == 1:
                    warnings.append(f"{year} 年 {village} 在 m11 中找不到資料")
                continue
            for gender_key, row in genders.items():
                monthly.append(
                    {
                        "年份": year,
                        "月份": month,
                        "里": village,
                        "性別": GENDER_LABELS.get(gender_key, gender_key),
                        "人口數": safe_int(row.iloc[pop_col]),
                        "出生人數": safe_int(row.iloc[birth_col]),
                        "死亡人數": safe_int(row.iloc[death_col]),
                    }
                )

    return monthly, warnings
