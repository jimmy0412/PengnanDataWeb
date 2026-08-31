import asyncio
from pathlib import Path
from unittest.mock import patch

import httpx

from app.config import TARGET_VILLAGES
from app.main import app
from app.services.query_data import build_indicator_comparison


def _send(method, path, **kwargs):
    async def send():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def test_builds_complete_seven_village_average():
    rows = [
        {"年份": 114, "里": village, "總人口": (index + 1) * 10}
        for index, village in enumerate(TARGET_VILLAGES)
    ]
    with patch("app.services.query_data.query_indicators", return_value=rows):
        result = build_indicator_comparison([114], TARGET_VILLAGES[0], "全部", "總人口")

    assert result == [
        {"year": 114, "village_value": 10, "average": 40.0, "sample_size": 7}
    ]


def test_ignores_missing_values_and_keeps_missing_selected_village():
    rows = [
        {"年份": 113, "里": TARGET_VILLAGES[1], "出生率": -1.235},
        {"年份": 113, "里": TARGET_VILLAGES[2], "出生率": 2.0},
        {"年份": 114, "里": TARGET_VILLAGES[0], "出生率": None},
        {"年份": 114, "里": TARGET_VILLAGES[1], "出生率": 4.0},
    ]
    with patch("app.services.query_data.query_indicators", return_value=rows):
        result = build_indicator_comparison(
            [114, 113, 114], TARGET_VILLAGES[0], "女", "出生率"
        )

    assert result == [
        {"year": 113, "village_value": None, "average": 0.38, "sample_size": 2},
        {"year": 114, "village_value": None, "average": 4.0, "sample_size": 1},
    ]


def test_comparison_api_returns_schema_and_partial_years():
    series = [
        {"year": 113, "village_value": None, "average": None, "sample_size": 0},
        {"year": 114, "village_value": 6.42, "average": 5.87, "sample_size": 6},
    ]
    with patch("app.main.build_indicator_comparison", return_value=series) as build:
        response = _send(
            "GET",
            "/api/indicator-comparison",
            params=[
                ("years", 114),
                ("years", 113),
                ("village", "鐵線里"),
                ("gender", "全部"),
                ("metric", "出生率"),
            ],
        )

    assert response.status_code == 200
    assert response.json() == {
        "metric": {"key": "出生率", "label": "出生率", "unit": "‰"},
        "village": "鐵線里",
        "gender": "全部",
        "series": series,
    }
    build.assert_called_once_with([114, 113], "鐵線里", "全部", "出生率")


def test_comparison_api_validates_inputs_and_empty_data():
    valid_params = {"years": 114, "village": "鐵線里", "gender": "全部", "metric": "總人口"}

    assert _send("GET", "/api/indicator-comparison", params={**valid_params, "village": "澎南區"}).status_code == 400
    assert _send("GET", "/api/indicator-comparison", params={**valid_params, "metric": "不存在"}).status_code == 400
    assert _send("GET", "/api/indicator-comparison", params={**valid_params, "gender": "不拘"}).status_code == 422
    assert _send("GET", "/api/indicator-comparison", params={key: value for key, value in valid_params.items() if key != "years"}).status_code == 422

    empty = [{"year": 114, "village_value": None, "average": None, "sample_size": 0}]
    with patch("app.main.build_indicator_comparison", return_value=empty):
        response = _send("GET", "/api/indicator-comparison", params=valid_params)
    assert response.status_code == 404


def test_bar_average_page_renders_controls_and_active_navigation():
    with patch("app.main.load_status", return_value={"processed_years": [113, 114]}):
        response = _send("GET", "/bar-average")

    assert response.status_code == 200
    assert 'href="/bar-average" class="active"' in response.text
    assert 'id="comparison-years" class="year-checks"' in response.text
    assert response.text.count('class="year-cb"') == 2
    for metric in ("總人口", "年出生", "年死亡", "扶老比", "出生率", "自然增加率"):
        assert f'<option value="{metric}"' in response.text
    assert "/static/js/bar_average.js?v=8" in response.text
    assert "chart.js@4.4.9" in response.text
    assert 'id="comparison-average-visible" type="checkbox" checked' in response.text
    assert 'id="comparison-focused-scale" type="checkbox" checked' in response.text
    assert 'id="comparison-bar-width"' in response.text
    assert 'value="70"' in response.text
    assert "Y 軸會依目前顯示的資料範圍自動縮放" in response.text


def test_bar_average_script_supports_checking_the_average_line():
    script = Path("static/js/bar_average.js").read_text(encoding="utf-8")

    assert "let averageLineVisible = true" in script
    assert "hidden: !averageLineVisible" in script
    assert "comparisonChart.setDatasetVisibility(averageIndex, averageLineVisible)" in script
    assert 'legendItem.text !== "七里平均" || averageLineVisible' in script
    assert '.addEventListener("change", updateAverageLineVisibility)' in script
    assert "barPercentage: comparisonBarWidth" in script
    assert '.addEventListener("input", updateComparisonBarWidth)' in script


def test_bar_average_script_uses_focused_axis_and_value_labels():
    script = Path("static/js/bar_average.js").read_text(encoding="utf-8")

    assert 'id: "comparisonValueLabels"' in script
    assert '["bar", "line"].includes(dataset.type)' in script
    assert "rawValue == null" in script
    assert "Number.isFinite(Number(rawValue))" in script
    assert 'textBaseline = isBelow ? "top" : "bottom"' in script
    assert "plugins: [comparisonValueLabels]" in script
    assert 'dataset.type === "line" ? dataset.borderColor' in script
    assert "let focusedScaleEnabled = true" in script
    assert "if (!focusedScaleEnabled) return" not in script
    assert "beginAtZero: !focusedScaleEnabled" in script
    assert 'grace: focusedScaleEnabled ? "10%" : 0' in script
    assert '.addEventListener("change", updateFocusedScale)' in script
