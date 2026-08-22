import asyncio
from unittest.mock import patch

import httpx

from app.main import app


def _send(method, path, **kwargs):
    async def send():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def test_process_job_exposes_completed_result():
    result = {
        "processed_years": [114],
        "processed_this_run": [114],
        "warnings": [],
        "errors": [],
    }

    def process(years, download, progress):
        progress("正在解析", 1, 2)
        return result

    with patch("app.main.process_years", side_effect=process):
        response = _send(
            "POST",
            "/api/jobs/process",
            json={"years_text": "114", "download": False},
        )

    assert response.status_code == 202
    job_response = _send("GET", f"/api/jobs/{response.json()['id']}")
    assert job_response.status_code == 200
    assert job_response.json()["status"] == "completed"
    assert job_response.json()["result"] == result


def test_delete_job_rejects_unknown_year():
    with patch("app.main.load_status", return_value={"processed_years": [114]}):
        response = _send("POST", "/api/jobs/delete-year", json={"year": 113})

    assert response.status_code == 404
    assert response.json()["detail"] == "找不到 113 年的已彙整資料"


def test_unknown_job_returns_not_found():
    response = _send("GET", "/api/jobs/not-a-job")
    assert response.status_code == 404


def test_process_page_renders_delete_year_options_without_javascript():
    with patch(
        "app.main.load_status",
        return_value={"processed_years": [109, 110], "ods_age_path": None},
    ):
        response = _send("GET", "/")

    assert response.status_code == 200
    assert '<option value="109">109</option>' in response.text
    assert '<option value="110">110</option>' in response.text
    assert "/static/js/process.js?v=2" in response.text


def test_chart_and_table_pages_render_checkbox_year_pickers():
    with patch("app.main.load_status", return_value={"processed_years": [109, 110]}):
        indicators_response = _send("GET", "/indicators")
        tables_response = _send("GET", "/tables")

    assert indicators_response.status_code == 200
    assert 'id="chart-years" class="year-checks"' in indicators_response.text
    assert 'id="chart-years" multiple' not in indicators_response.text
    assert indicators_response.text.count('class="year-cb"') == 2
    assert "/static/js/common.js?v=2" in indicators_response.text

    assert tables_response.status_code == 200
    assert 'id="pivot-years" class="year-checks"' in tables_response.text
    assert 'id="table-years" class="year-checks"' in tables_response.text
    assert tables_response.text.count('class="year-cb"') == 4
    assert "/static/js/common.js?v=2" in tables_response.text


def test_table_details_are_collapsed_by_default():
    with patch("app.main.load_status", return_value={"processed_years": []}):
        response = _send("GET", "/tables")

    assert response.status_code == 200
    assert '<details class="card collapsible-card">' in response.text
    assert '<details class="card collapsible-card" open>' not in response.text
    assert "<summary><span>明細資料</span></summary>" in response.text
