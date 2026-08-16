"""Query and aggregate cached population data."""

from __future__ import annotations

from app.config import AGE_GROUPS, ALL_VILLAGES_LABEL, TARGET_VILLAGES
from app.services.export_ods import load_year_cache


def _aggregate_age_structure(rows: list[dict]) -> list[dict]:
    """Sum population across target villages by year, gender, age group."""
    bucket: dict[tuple, int] = {}
    years_seen: set[int] = set()

    for row in rows:
        if row["里"] not in TARGET_VILLAGES:
            continue
        key = (row["年份"], row["性別"], row["年齡組"])
        bucket[key] = bucket.get(key, 0) + int(row["人口數"])
        years_seen.add(row["年份"])

    result: list[dict] = []
    for year in sorted(years_seen):
        for gender in ("全部", "男", "女"):
            for group in AGE_GROUPS:
                pop = bucket.get((year, gender, group), 0)
                result.append(
                    {
                        "年份": year,
                        "里": ALL_VILLAGES_LABEL,
                        "性別": gender,
                        "年齡組": group,
                        "人口數": pop,
                    }
                )
    return result


def _aggregate_indicators(rows: list[dict]) -> list[dict]:
    """Combine village-level indicators into 全部里 totals."""
    by_year_gender: dict[tuple, list[dict]] = {}
    for row in rows:
        if row["里"] not in TARGET_VILLAGES:
            continue
        key = (row["年份"], row["性別"])
        by_year_gender.setdefault(key, []).append(row)

    result: list[dict] = []
    for (year, gender), village_rows in sorted(by_year_gender.items()):
        total_pop = sum(r["總人口"] for r in village_rows)
        births = sum(r["年出生"] for r in village_rows)
        deaths = sum(r["年死亡"] for r in village_rows)

        if total_pop > 0:
            birth_rate = round(births / total_pop * 1000, 2)
            natural_rate = round((births - deaths) / total_pop * 1000, 2)
        else:
            birth_rate = None
            natural_rate = None

        elderly_ratio = _elderly_from_age(year, gender)
        if elderly_ratio is None:
            elderly_vals = [r["扶老比"] for r in village_rows if r.get("扶老比") is not None]
            pop_weights = [r["總人口"] for r in village_rows if r.get("扶老比") is not None]
            if elderly_vals and sum(pop_weights) > 0:
                elderly_ratio = round(
                    sum(e * p for e, p in zip(elderly_vals, pop_weights)) / sum(pop_weights), 2
                )

        result.append(
            {
                "年份": year,
                "里": ALL_VILLAGES_LABEL,
                "性別": gender,
                "總人口": int(total_pop),
                "扶老比": elderly_ratio,
                "出生率": birth_rate,
                "自然增加率": natural_rate,
                "年出生": births,
                "年死亡": deaths,
            }
        )
    return result


PIVOT_INDICATORS = [
    ("總人口", "總人口"),
    ("年出生", "年出生"),
    ("出生率", "出生率"),
    ("扶老比", "扶老比"),
]


def build_indicators_pivot(
    years: list[int],
    village: str,
) -> dict:
    """
    Pivot table: rows = years, columns = indicators with male/female sub-cells.
    """
    sorted_years = sorted(set(years))
    rows: list[dict] = []

    for year in sorted_years:
        row_data: dict = {"年份": year}
        for label, field in PIVOT_INDICATORS:
            male_rows = query_indicators([year], [village], "男")
            female_rows = query_indicators([year], [village], "女")
            male_match = next((r for r in male_rows if r["年份"] == year), None)
            female_match = next((r for r in female_rows if r["年份"] == year), None)
            row_data[label] = {
                "男": male_match.get(field) if male_match else None,
                "女": female_match.get(field) if female_match else None,
            }
        rows.append(row_data)

    return {
        "indicators": [label for label, _ in PIVOT_INDICATORS],
        "years": sorted_years,
        "village": village,
        "rows": rows,
    }


def build_map_village_data(year: int) -> dict:
    """Per-village metrics for map layers (minicharts, choropleth)."""
    villages_data: list[dict] = []

    for village in TARGET_VILLAGES:
        male_rows = query_indicators([year], [village], "男")
        female_rows = query_indicators([year], [village], "女")
        all_rows = query_indicators([year], [village], "全部")
        male = next((r for r in male_rows if r["年份"] == year), None)
        female = next((r for r in female_rows if r["年份"] == year), None)
        total = next((r for r in all_rows if r["年份"] == year), None)

        age_male = query_age_structure([year], [village], "男")
        age_female = query_age_structure([year], [village], "女")

        villages_data.append(
            {
                "里": village,
                "總人口": {
                    "男": male.get("總人口") if male else None,
                    "女": female.get("總人口") if female else None,
                    "全部": total.get("總人口") if total else None,
                },
                "出生率": {
                    "男": male.get("出生率") if male else None,
                    "女": female.get("出生率") if female else None,
                    "全部": total.get("出生率") if total else None,
                },
                "扶老比": {
                    "男": male.get("扶老比") if male else None,
                    "女": female.get("扶老比") if female else None,
                    "全部": total.get("扶老比") if total else None,
                },
                "年出生": {
                    "男": male.get("年出生") if male else None,
                    "女": female.get("年出生") if female else None,
                    "全部": total.get("年出生") if total else None,
                },
                "年齡組": {
                    "男": [
                        {"年齡組": r["年齡組"], "人口數": r["人口數"]}
                        for r in age_male
                        if r["年份"] == year
                    ],
                    "女": [
                        {"年齡組": r["年齡組"], "人口數": r["人口數"]}
                        for r in age_female
                        if r["年份"] == year
                    ],
                },
            }
        )

    return {"year": year, "villages": villages_data}


def _elderly_from_age(year: int, gender: str) -> float | None:
    caches = []
    cache = load_year_cache(year)
    if not cache:
        return None
    age_rows = _aggregate_age_structure(cache.get("age_structure", []))
    groups = [r for r in age_rows if r["性別"] == gender and r["里"] == ALL_VILLAGES_LABEL]
    pop_65 = sum(r["人口數"] for r in groups if int(r["年齡組"].split("–")[0]) >= 65)
    pop_15_64 = sum(
        r["人口數"]
        for r in groups
        if 15 <= int(r["年齡組"].split("–")[0]) <= 64
    )
    if pop_15_64 <= 0:
        return None
    return round(pop_65 / pop_15_64 * 100, 2)


def resolve_village_filter(villages: list[str]) -> tuple[set[str], bool]:
    """Return (per-village names to include, include_all_aggregate)."""
    if not villages:
        return set(TARGET_VILLAGES), False
    want_all = ALL_VILLAGES_LABEL in villages
    names = {v for v in villages if v in TARGET_VILLAGES}
    return names, want_all


def query_age_structure(
    years: list[int],
    villages: list[str],
    gender: str,
) -> list[dict]:
    village_names, want_all = resolve_village_filter(villages)
    records: list[dict] = []

    for year in years:
        cache = load_year_cache(year)
        if not cache:
            continue
        rows = cache.get("age_structure", [])

        if want_all:
            agg = _aggregate_age_structure(rows)
            records.extend(r for r in agg if r["性別"] == gender)

        per_village = village_names if village_names else (set() if want_all else set(TARGET_VILLAGES))
        for row in rows:
            if row["里"] not in per_village:
                continue
            if row["性別"] != gender:
                continue
            records.append(row)

    return records


def query_indicators(
    years: list[int],
    villages: list[str],
    gender: str,
) -> list[dict]:
    village_names, want_all = resolve_village_filter(villages)
    records: list[dict] = []

    for year in sorted(years):
        cache = load_year_cache(year)
        if not cache:
            continue
        rows = cache.get("indicators", [])

        if want_all:
            agg = _aggregate_indicators(rows)
            records.extend(r for r in agg if r["性別"] == gender)

        per_village = village_names if village_names else (set() if want_all else set(TARGET_VILLAGES))
        for row in rows:
            if row["里"] not in per_village:
                continue
            if row["性別"] != gender:
                continue
            records.append(row)

    return records
