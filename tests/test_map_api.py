import asyncio
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from app.main import app
from app.services.map_layers import MapLayerDataNotFoundError


class MapLayerApiTests(unittest.TestCase):
    def request(self, method, url, **kwargs):
        async def send():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                return await client.request(method, url, **kwargs)

        return asyncio.run(send())

    def test_creates_layers_from_indicator_and_age_data(self):
        layer = {"id": "layer-1", "name": "測試圖層"}
        for data_type, metric in [("indicators", "總人口"), ("age", None)]:
            with self.subTest(data_type=data_type), patch(
                "app.main.create_custom_layer_from_data", return_value=layer
            ) as create:
                response = self.request(
                    "POST",
                    "/api/map-custom-layers/from-data",
                    json={
                        "name": "測試圖層",
                        "chart_type": "bar",
                        "year": 114,
                        "data_type": data_type,
                        "gender": "全部",
                        "metric": metric,
                    },
                )

                self.assertEqual(response.status_code, 201)
                self.assertEqual(response.json(), {"layer": layer})
                create.assert_called_once_with(
                    "測試圖層", "bar", 114, data_type, "全部", metric
                )

    def test_returns_not_found_for_missing_processed_data(self):
        with patch(
            "app.main.create_custom_layer_from_data",
            side_effect=MapLayerDataNotFoundError("資料不完整"),
        ):
            response = self.request(
                "POST",
                "/api/map-custom-layers/from-data",
                json={
                    "name": "缺資料",
                    "chart_type": "pie",
                    "year": 999,
                    "data_type": "age",
                    "gender": "女",
                },
            )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "資料不完整")

    def test_rejects_invalid_layer_options(self):
        response = self.request(
            "POST",
            "/api/map-custom-layers/from-data",
            json={
                "name": "錯誤圖層",
                "chart_type": "line",
                "year": 114,
                "data_type": "indicators",
                "gender": "全部",
                "metric": "總人口",
            },
        )
        self.assertEqual(response.status_code, 422)

    def test_deletes_shared_layer(self):
        with patch("app.main.delete_custom_layer", return_value=True):
            response = self.request("DELETE", "/api/map-custom-layers/layer-1")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.content, b"")

    def test_returns_not_found_for_unknown_layer(self):
        with patch("app.main.delete_custom_layer", return_value=False):
            response = self.request("DELETE", "/api/map-custom-layers/missing")
        self.assertEqual(response.status_code, 404)

    def test_map_uses_built_in_svg_charts(self):
        response = self.request("GET", "/map")
        map_script = Path("static/js/map.js").read_text(encoding="utf-8")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("leaflet.minichart", response.text)
        self.assertIn("/static/js/map.js?v=2", response.text)
        self.assertIn("function createBarChartSvg", map_script)
        self.assertIn("function createPieChartSvg", map_script)
        self.assertNotIn("L.minichart", map_script)


if __name__ == "__main__":
    unittest.main()
