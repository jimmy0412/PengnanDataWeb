import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.config import AGE_GROUPS, TARGET_VILLAGES
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

    def test_creates_age_snapshot_with_all_age_groups(self):
        rows = [
            {"年份": 114, "里": village, "性別": "女", "年齡組": group, "人口數": index}
            for village in TARGET_VILLAGES
            for index, group in enumerate(AGE_GROUPS)
        ]
        with patch.object(map_layers, "query_age_structure", return_value=rows):
            layer = map_layers.create_custom_layer_from_data(
                "女性年齡", "pie", 114, "age", "女"
            )

        self.assertEqual(layer["series"], AGE_GROUPS)
        self.assertEqual(layer["source_meta"]["data_type"], "age")
        self.assertIsNone(layer["source_meta"]["metric"])

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
