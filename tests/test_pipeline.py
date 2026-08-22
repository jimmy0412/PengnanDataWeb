import asyncio
from unittest.mock import patch

import httpx

from app.main import app
from app.services.pipeline import process_years


def test_source_page_failure_falls_back_to_local_files(tmp_path):
    local_m31 = tmp_path / "114-m31.ods"
    local_m11 = tmp_path / "114-m11.ods"
    local_m31.touch()
    local_m11.touch()
    result = {
        "year": 114,
        "age_records": [],
        "indicators": [],
        "warnings": [],
        "errors": [],
        "m31": str(local_m31),
        "m11": str(local_m11),
    }

    with (
        patch(
            "app.services.pipeline.fetch_file_links",
            side_effect=RuntimeError("source unavailable"),
        ),
        patch("app.services.pipeline.process_year", return_value=result) as process,
        patch(
            "app.services.pipeline.export_consolidated",
            return_value=(tmp_path / "age.ods", tmp_path / "ind.ods", "114"),
        ),
        patch("app.services.pipeline.list_cached_years", return_value=[109, 114]),
        patch(
            "app.services.pipeline.load_year_cache",
            return_value={"age_structure": [], "indicators": []},
        ),
        patch("app.services.pipeline.write_status"),
    ):
        response = process_years([114], download=True)

    assert response["processed_years"] == [109, 114]
    assert response["processed_this_run"] == [114]
    assert response["warnings"] == [
        "無法讀取政府統計頁下載連結: source unavailable"
    ]
    process.assert_called_once_with(114, links={}, download=False)


def test_process_api_returns_json_for_unexpected_error():
    async def send():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            return await client.post(
                "/api/process", json={"years_text": "114", "download": False}
            )

    with patch("app.main.process_years", side_effect=RuntimeError("disk unavailable")):
        response = asyncio.run(send())

    assert response.status_code == 500
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {"detail": "彙整處理失敗: disk unavailable"}
