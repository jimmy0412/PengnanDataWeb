"""HTTP / input helpers."""

from __future__ import annotations

import re


def parse_years_input(text: str) -> list[int]:
    """
    Parse year input like '110-114', '110,111,112', or '110 111'.
    """
    text = text.strip()
    if not text:
        return []

    years: set[int] = set()
    for part in re.split(r"[,，\s]+", text):
        part = part.strip()
        if not part:
            continue
        range_m = re.match(r"^(\d{2,3})\s*-\s*(\d{2,3})$", part)
        if range_m:
            start, end = int(range_m.group(1)), int(range_m.group(2))
            if start > end:
                start, end = end, start
            years.update(range(start, end + 1))
        elif part.isdigit():
            years.add(int(part))
        else:
            raise ValueError(f"無法解析年份: {part}")

    return sorted(years)
