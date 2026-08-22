from types import SimpleNamespace

import pandas as pd

from app.services.parse_m11 import _find_header
from app.services.parse_utils import extract_village_blocks, find_year_sheets


def test_finds_legacy_two_row_m11_header():
    df = pd.DataFrame(
        [
            ["標題", "", "", ""],
            ["區域", "性", "人口", "出生"],
            ["別", "別", "數", "人數"],
        ]
    )

    index, header = _find_header(df)

    assert index == 2
    assert list(header) == ["區域別", "性別", "人口數", "出生人數"]


def test_accepts_underscore_in_legacy_month_sheet_name():
    workbook = SimpleNamespace(
        sheet_names=["109年1月", "109_年2月", "109年10月", "108年12月"]
    )

    assert find_year_sheets(workbook, 109) == ["109年1月", "109_年2月", "109年10月"]


def test_village_name_on_male_row_keeps_preceding_total_row():
    df = pd.DataFrame(
        [
            ["", "計", 721],
            ["鐵線里", "男", 353],
            ["", "女", 368],
            ["", "計", 1920],
            ["山水里", "男", 993],
            ["", "女", 927],
        ]
    )

    blocks = extract_village_blocks(df)

    assert blocks["鐵線里"]["計"].iloc[2] == 721
    assert blocks["鐵線里"]["男"].iloc[2] == 353
    assert blocks["鐵線里"]["女"].iloc[2] == 368
    assert blocks["山水里"]["計"].iloc[2] == 1920
