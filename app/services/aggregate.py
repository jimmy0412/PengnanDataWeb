"""Aggregate monthly m11 and m31 data into annual indicators."""

from __future__ import annotations

from collections import defaultdict

from app.config import TARGET_VILLAGES


def _december_population(rows: list[dict]) -> int:
    """Year-end population: December snapshot, or last available month."""
    if not rows:
        return 0
    dec = [r for r in rows if r["月份"] == 12]
    if dec:
        return int(dec[0]["人口數"])
    latest = max(r["月份"] for r in rows)
    latest_rows = [r for r in rows if r["月份"] == latest]
    return int(latest_rows[0]["人口數"]) if latest_rows else 0


def build_annual_indicators(
    monthly_m11: list[dict],
    elderly_m31: list[dict],
    year: int,
) -> list[dict]:
    """
    Combine m11 monthly stats with m31 扶老比.
    總人口 = 12 月底現住人口（整數）；出生率/自然增加率分母仍用年中人口（12 月平均）。
    """
    elderly_map: dict[tuple[str, str], float | None] = {}
    for row in elderly_m31:
        if row["年份"] != year:
            continue
        elderly_map[(row["里"], row["性別"])] = row.get("扶老比")

    grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in monthly_m11:
        if row["年份"] != year:
            continue
        grouped[(row["里"], row["性別"])].append(row)

    records: list[dict] = []
    for village in TARGET_VILLAGES:
        for gender in ("全部", "男", "女"):
            rows = grouped.get((village, gender), [])
            if not rows:
                continue

            year_end_pop = _december_population(rows)
            avg_pop = sum(r["人口數"] for r in rows) / len(rows)
            births = sum(r["出生人數"] for r in rows)
            deaths = sum(r["死亡人數"] for r in rows)

            if avg_pop <= 0:
                birth_rate = None
                natural_rate = None
            else:
                birth_rate = round(births / avg_pop * 1000, 2)
                natural_rate = round((births - deaths) / avg_pop * 1000, 2)

            records.append(
                {
                    "年份": year,
                    "里": village,
                    "性別": gender,
                    "總人口": year_end_pop,
                    "扶老比": elderly_map.get((village, gender)),
                    "出生率": birth_rate,
                    "自然增加率": natural_rate,
                    "年出生": births,
                    "年死亡": deaths,
                }
            )

    return records


def merge_year_cache(
    age_records: list[dict],
    indicator_records: list[dict],
) -> dict:
    return {
        "age_structure": age_records,
        "indicators": indicator_records,
    }
