import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.config import TARGET_VILLAGES
from app.services import map_layers


CSV = "里,男,女\n鐵線里,120,80\n嵵裡里,90,100\n"


class MapLayerCatalogTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.layers_dir = Path(self.tempdir.name)
        self.old_dir = map_layers.MAP_LAYERS_DIR
        self.old_catalog = map_layers.MAP_LAYERS_CATALOG_FILE
        map_layers.MAP_LAYERS_DIR = self.layers_dir
        map_layers.MAP_LAYERS_CATALOG_FILE = self.layers_dir / "catalog.json"

    def tearDown(self):
        map_layers.MAP_LAYERS_DIR = self.old_dir
        map_layers.MAP_LAYERS_CATALOG_FILE = self.old_catalog
        self.tempdir.cleanup()

    def test_creates_and_reads_normalized_layer(self):
        layer = map_layers.create_custom_layer("測試人口", "donut", CSV.encode())
        self.assertEqual(layer["series"], ["男", "女"])
        self.assertEqual(layer["values"]["鐵線里"]["男"], 120.0)
        self.assertEqual(map_layers.load_custom_layers()[0]["id"], layer["id"])
        self.assertTrue((self.layers_dir / layer["source_file"]).exists())

    def test_requires_village_column(self):
        with self.assertRaisesRegex(map_layers.MapLayerValidationError, "里"):
            map_layers.create_custom_layer("x", "bar", "名稱,數值\n鐵線里,1\n".encode())

    def test_rejects_unknown_village_non_number_and_duplicate(self):
        for csv_text, message in [
            ("里,A\n未知里,1\n", "不支援"),
            ("里,A\n鐵線里,nope\n", "數值"),
            ("里,A\n鐵線里,NaN\n", "有限"),
            ("里,A\n鐵線里,1\n鐵線里,2\n", "重複"),
        ]:
            with self.subTest(message=message), self.assertRaisesRegex(map_layers.MapLayerValidationError, message):
                map_layers.create_custom_layer("x", "bar", csv_text.encode())

    def test_creates_indicator_snapshot_with_source_metadata(self):
        rows = [
            {"年份": 114, "里": village, "性別": "全部", "總人口": index + 100}
            for index, village in enumerate(TARGET_VILLAGES)
        ]
        with patch.object(map_layers, "query_indicators", return_value=rows):
            layer = map_layers.create_custom_layer_from_data(
                "114 年人口", "bar", 114, "indicators", "全部", "總人口"
            )

        self.assertEqual(layer["source_type"], "processed_data")
        self.assertEqual(layer["source_meta"]["metric"], "總人口")
        self.assertEqual(layer["series"], ["總人口"])
        self.assertEqual(layer["values"]["鐵線里"]["總人口"], 100.0)
        self.assertNotIn("source_file", layer)

    def test_rejects_new_age_snapshot_but_keeps_existing_age_layer(self):
        with self.assertRaisesRegex(map_layers.MapLayerValidationError, "indicators"):
            map_layers.create_custom_layer_from_data("女性年齡", "pie", 114, "age", "女")
        existing = map_layers._build_layer(
            "舊年齡圖層", "pie", ["0-4歲"], {"鐵線里": {"0-4歲": 12}},
            source={"type": "processed_data", "year": 113, "data_type": "age", "gender": "女", "metric": None, "unit": "人"},
        )
        map_layers._atomic_write({"schema_version": 2, "layers": [existing]})
        self.assertEqual(map_layers.load_catalog_v2()["layers"][0]["source"]["data_type"], "age")
        self.assertTrue(map_layers.delete_custom_layer(existing["id"]))

    def test_rejects_incomplete_processed_data(self):
        with patch.object(map_layers, "query_indicators", return_value=[]):
            with self.assertRaisesRegex(map_layers.MapLayerDataNotFoundError, "資料不完整"):
                map_layers.create_custom_layer_from_data(
                    "缺資料", "bar", 114, "indicators", "全部", "總人口"
                )

    def test_deletes_csv_layer_and_source_file(self):
        layer = map_layers.create_custom_layer("測試人口", "bar", CSV.encode())
        source_path = self.layers_dir / layer["source_file"]

        self.assertTrue(map_layers.delete_custom_layer(layer["id"]))
        self.assertFalse(source_path.exists())
        self.assertEqual(map_layers.load_custom_layers(), [])
        self.assertFalse(map_layers.delete_custom_layer(layer["id"]))

    def test_deletes_processed_layer_without_source_file(self):
        rows = [
            {"年份": 114, "里": village, "性別": "全部", "總人口": 1}
            for village in TARGET_VILLAGES
        ]
        with patch.object(map_layers, "query_indicators", return_value=rows):
            layer = map_layers.create_custom_layer_from_data(
                "人口", "donut", 114, "indicators", "全部", "總人口"
            )
        self.assertTrue(map_layers.delete_custom_layer(layer["id"]))
        self.assertEqual(map_layers.load_custom_layers(), [])

    def test_updates_selected_bar_series_colors_atomically(self):
        layer = map_layers.create_map_layer_v2("測試人口", "bar", CSV.encode())
        first, second = [item["id"] for item in layer["series"]]
        updated = map_layers.update_map_layer_colors_v2(layer["id"], {first: "#abcdef", second: "#123456"})
        self.assertEqual([item["color"] for item in updated["series"]], ["#abcdef", "#123456"])
        persisted = map_layers.load_catalog_v2()["layers"][0]
        self.assertEqual([item["color"] for item in persisted["series"]], ["#abcdef", "#123456"])

    def test_rejects_invalid_color_updates_without_changing_catalog(self):
        layer = map_layers.create_map_layer_v2("測試人口", "bar", CSV.encode())
        original = map_layers.load_catalog_v2()
        for colors, message in [({}, "至少一個"), ({"missing": "#abcdef"}, "找不到指定的系列"), ({layer["series"][0]["id"]: "red"}, "#RRGGBB")]:
            with self.subTest(colors=colors), self.assertRaisesRegex(map_layers.MapLayerValidationError, message):
                map_layers.update_map_layer_colors_v2(layer["id"], colors)
        self.assertEqual(map_layers.load_catalog_v2(), original)

    def test_rejects_choropleth_series_color_updates(self):
        layer = map_layers.create_map_layer_v2("測試面量圖", "choropleth", "里,數值\n鐵線里,1\n".encode())
        series_id = layer["series"][0]["id"]
        with self.assertRaisesRegex(map_layers.MapLayerValidationError, "只有長條圖、圓餅圖或甜甜圈圖"):
            map_layers.update_map_layer_colors_v2(layer["id"], {series_id: "#abcdef"})

    def test_loads_legacy_catalog_as_csv_source(self):
        self.layers_dir.mkdir(parents=True, exist_ok=True)
        map_layers.MAP_LAYERS_CATALOG_FILE.write_text(
            json.dumps([{"id": "legacy", "name": "舊圖層"}]), encoding="utf-8"
        )

        layer = map_layers.load_custom_layers()[0]

        self.assertEqual(layer["source_type"], "csv")
        self.assertEqual(layer["source_meta"], {})


if __name__ == "__main__":
    unittest.main()
