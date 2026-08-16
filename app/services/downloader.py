"""Download m31/m11 files from Penghu Makung statistics page."""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urljoin

import httpx

from app.config import FILE_BASE_URL, RAW_DIR, STATISTICS_PAGE_URL


def _normalize_href(href: str) -> str:
    return href.replace("\t", "").strip()


def fetch_file_links() -> dict[str, dict[str, str]]:
    """
    Scrape statistics page and return {year: {m31: url, m11: url}}.
    """
    response = httpx.get(STATISTICS_PAGE_URL, timeout=60, follow_redirects=True)
    response.raise_for_status()
    html = response.text

    links: dict[str, dict[str, str]] = {}
    pattern = re.compile(
        r'href="(/userfiles/01/files/(\d+)-(m31|m11)[^"]*\.(?:ods|xlsx))"',
        re.IGNORECASE,
    )
    for match in pattern.finditer(html):
        href = _normalize_href(match.group(1))
        year = match.group(2)
        kind = match.group(3).lower()
        full_url = urljoin(FILE_BASE_URL, href)
        links.setdefault(year, {})
        # Keep first match per kind; newer links on page are typically listed first
        if kind not in links[year]:
            links[year][kind] = full_url

    return links


def download_year_files(
    year: int,
    links: dict[str, dict[str, str]] | None = None,
    skip_existing: bool = True,
) -> tuple[Path | None, Path | None, list[str]]:
    """
    Download m31 and m11 for a year into data/raw/{year}/.
    Returns (m31_path, m11_path, errors).
    """
    year_key = str(year)
    if links is None:
        links = fetch_file_links()

    year_links = links.get(year_key, {})
    errors: list[str] = []
    out_dir = RAW_DIR / year_key
    out_dir.mkdir(parents=True, exist_ok=True)

    paths: dict[str, Path | None] = {"m31": None, "m11": None}

    for kind in ("m31", "m11"):
        url = year_links.get(kind)
        if not url:
            errors.append(f"{year} 年缺少 {kind} 下載連結（請手動上傳至 data/raw/{year}/）")
            continue

        filename = url.split("/")[-1]
        filename = filename.replace("%20", " ")
        dest = out_dir / filename

        if skip_existing and dest.exists() and dest.stat().st_size > 1000:
            paths[kind] = dest
            continue

        try:
            with httpx.stream("GET", url, timeout=120, follow_redirects=True) as resp:
                resp.raise_for_status()
                with dest.open("wb") as f:
                    for chunk in resp.iter_bytes():
                        f.write(chunk)
            paths[kind] = dest
        except httpx.HTTPError as exc:
            errors.append(f"{year} 年 {kind} 下載失敗: {exc}")

    return paths["m31"], paths["m11"], errors


def resolve_local_files(year: int) -> tuple[Path | None, Path | None]:
    """Find already-downloaded m31/m11 in raw dir."""
    raw_dir = RAW_DIR / str(year)
    if not raw_dir.exists():
        return None, None

    m31 = next(raw_dir.glob("*-m31*.ods"), None) or next(
        raw_dir.glob("*-m31*.xlsx"), None
    )
    m11 = next(raw_dir.glob("*-m11*.ods"), None)
    return m31, m11
