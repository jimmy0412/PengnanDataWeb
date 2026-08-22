"""Shared helpers for reading government ODS/XLSX files."""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

from app.config import TARGET_VILLAGES


def read_excel_file(path: Path, sheet_name: str | None = None) -> pd.ExcelFile:
    suffix = path.suffix.lower()
    if suffix == ".ods":
        engine = "odf"
    elif suffix in (".xlsx", ".xls"):
        engine = "openpyxl"
    else:
        raise ValueError(f"Unsupported file type: {path}")
    return pd.ExcelFile(path, engine=engine)


def read_sheet(path: Path, sheet_name: str) -> pd.DataFrame:
    suffix = path.suffix.lower()
    engine = "odf" if suffix == ".ods" else "openpyxl"
    return pd.read_excel(path, sheet_name=sheet_name, header=None, engine=engine)


def find_year_sheets(xl: pd.ExcelFile, year: int) -> list[str]:
    pattern = re.compile(rf"^{re.escape(str(year))}_?\s*年\s*(\d{{1,2}})月")
    matches: list[tuple[int, str]] = []
    for sheet in xl.sheet_names:
        match = pattern.match(sheet)
        if match:
            matches.append((int(match.group(1)), sheet))
    return [sheet for _, sheet in sorted(matches)]


def pick_december_sheet(xl: pd.ExcelFile, year: int) -> tuple[str, list[str]]:
    """Return (selected_sheet, warnings)."""
    warnings: list[str] = []
    target = f"{year}年12月"
    if target in xl.sheet_names:
        return target, warnings
    monthly = find_year_sheets(xl, year)
    if not monthly:
        raise ValueError(f"No sheets found for year {year}")
    warnings.append(f"{year} 年無 12 月 sheet，改用 {monthly[-1]}")
    return monthly[-1], warnings


def cell_str(value) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


def safe_int(value) -> int:
    if pd.isna(value) or value == "":
        return 0
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def parse_age_columns(header_row: pd.Series) -> dict[int, int]:
    """Map column index -> age in years (0-99)."""
    age_cols: dict[int, int] = {}
    for idx, raw in enumerate(header_row):
        text = cell_str(raw)
        m = re.match(r"^(\d{1,3})歲$", text)
        if m:
            age_cols[idx] = int(m.group(1))
    return age_cols


def find_age_header_row(df: pd.DataFrame, search_rows: int = 8) -> int:
    """Locate the row containing single-year age headers (0歲..99歲)."""
    best_row = -1
    best_count = 0
    for i in range(min(search_rows, len(df))):
        count = len(parse_age_columns(df.iloc[i]))
        if count > best_count:
            best_count = count
            best_row = i
    if best_row < 0 or best_count < 10:
        raise ValueError("Could not find age header row")
    return best_row


def extract_village_blocks(
    df: pd.DataFrame,
    gender_col: int = 1,
) -> dict[str, dict[str, pd.Series]]:
    """
    Parse village rows from m31/m11 style tables.
    ``gender_col`` is detected from the header by each format-specific parser.
    Returns {village: {gender: row_series}} for 計/男/女.
    """
    blocks: dict[str, dict[str, pd.Series]] = {}
    current_village: str | None = None
    pending_total: pd.Series | None = None

    for _, row in df.iterrows():
        col0 = cell_str(row.iloc[0])
        gender_cell = cell_str(row.iloc[gender_col]) if len(row) > gender_col else ""

        if gender_cell == "計":
            if col0 in TARGET_VILLAGES:
                current_village = col0
                blocks.setdefault(current_village, {})["計"] = row
                pending_total = None
            else:
                # In older files the village name is placed on the following
                # male row, while its total row has an empty first cell.
                pending_total = row
                current_village = None
            continue

        if col0 in TARGET_VILLAGES:
            current_village = col0
            blocks.setdefault(current_village, {})
            if pending_total is not None:
                blocks[current_village]["計"] = pending_total
            pending_total = None
        elif col0:
            # A named row outside the target villages starts another block.
            current_village = None
            pending_total = None

        if current_village is None or current_village not in TARGET_VILLAGES:
            continue

        if gender_cell in ("男", "女"):
            blocks[current_village][gender_cell] = row

    return blocks
