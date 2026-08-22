# 澎湖馬公 7 里人口資料網站

自動從[馬公市戶政事務所統計頁](https://www.penghu.gov.tw/makun/home.jsp?id=36)下載 m31（年齡結構）與 m11（戶籍動態）檔案，彙整鐵線里、嵵裡里、風櫃里、井垵里、五德里、鎖港里、山水里共 7 里的資料，輸出統整 ODS，並在網頁上繪製人口金字塔與年度指標折線圖。

## 環境需求

- Python 3.10+
- 可連線至 `penghu.gov.tw`（下載原始檔時）

## 安裝

```bash
cd /mnt/d/web
pip install -r requirements.txt
```

## 啟動

```bash
cd /mnt/d/web
PYTHONPATH=. uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

瀏覽器開啟：http://127.0.0.1:8000

## 頁面說明

| 路徑 | 功能 |
|------|------|
| `/` | 下載政府資料、彙整 ODS |
| `/pyramid` | 人口金字塔（單一年份、單一里或**全部里**合計） |
| `/indicators` | 年度指標折線圖（扶老比、出生率、自然增加率等；多年份、多里或**全部里**） |
| `/tables` | 以表格檢視年齡結構與年度指標 |
| `/map` | 澎南區 7 里圖層工作區（人口圖表、指標填色、共享 CSV 圖表與高解析 PNG 下載） |

## 使用方式

1. 在「資料彙整」頁輸入民國年，例如 `110-114` 或 `110,111,112`，點「開始下載並彙整」。
   處理期間頁面會顯示目前階段與粗略完成百分比。
2. 至「人口金字塔」選擇年份與里別（含「澎南區」七里合計）。
3. 至「年度指標」選擇指標、勾選要比較的里別與年份。
4. 至「資料表格」使用橫向表格（年份為欄、指標為列）或明細表格。
5. 彙整後會產出兩份 ODS：**年齡結構**、**戶政指標**（分開下載）。
6. 圖表顏色會存入瀏覽器 `localStorage`。
7. 如需移除資料，可在「刪除年度資料」選擇年份；系統會一併刪除該年原始檔、快取及由該年建立的地圖快照，並依剩餘年份重建 ODS。自行上傳的 CSV 圖層不會被刪除。

## 總人口定義

表格中的「總人口」為該年 **12 月底現住人口**（整數）；「全部里」為 7 里人口**加總**。出生率、自然增加率的分母仍採 12 個月人口之平均（年中人口）。

## 指標公式

| 指標 | 公式 |
|------|------|
| 扶老比 | 65 歲以上 ÷ 15–64 歲 × 100 |
| 出生率 | 年出生 ÷ 年中人口 × 1000（‰） |
| 自然增加率 | (年出生 − 年死亡) ÷ 年中人口 × 1000（‰） |

年中人口為 12 個月現住人口的算術平均；年齡結構預設取 12 月（若無則用最後一個可用月份）。

## 折線圖新增指標

「年度指標折線圖」頁（`/indicators`）的指標下拉選單由 `app/config.py` 的 `LINE_CHART_METRICS` 設定，前端會透過模板注入 `window.LINE_CHART_METRICS`，**不必修改** `static/js/indicators.js`。

在清單末尾新增一筆字典即可：

```python
LINE_CHART_METRICS = [
    # ...既有項目...
    {
        "key": "新欄位名",       # 必須與 /api/indicators 回傳的欄位名稱一致
        "label": "顯示名稱",     # 下拉選單與圖表區塊標題用
        "unit": "‰",            # 工具提示與圖表副標題的單位（如 ‰、%）
        "y_axis": "Y 軸標籤",   # Chart.js Y 軸標題
    },
]
```

**注意：**

- `key` 必須對應 `query_indicators` / 彙整快取中每筆資料已有的欄位（例如 `自然增加率`、`出生率`、`扶老比`）。若 API 尚無該欄位，需先在 `app/services/aggregate.py`（或相關彙整邏輯）計算並寫入指標紀錄，再於此處註冊。
- 變更後重新啟動（或 `--reload` 自動重載）後，重新整理 `/indicators` 頁面即可看到新選項。

## 目錄結構

```
app/              FastAPI 後端
data/raw/         下載的原始 ODS/XLSX
data/processed/   JSON 快取與統整 ODS
data/samples/     開發用樣本（114 年）
static/           前端 CSS/JS
templates/        網頁模板
```

## API

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/process` | 下載並彙整 `{ "years_text": "110-114" }` |
| POST | `/api/jobs/process` | 建立下載與彙整背景工作 |
| POST | `/api/jobs/delete-year` | 建立刪除年度背景工作 `{ "year": 114 }` |
| GET | `/api/jobs/{job_id}` | 查詢背景工作階段、進度與結果 |
| GET | `/api/status` | 處理狀態 |
| GET | `/api/age-structure` | 五年齡組資料 |
| GET | `/api/indicators` | 年度指標 |
| GET | `/api/download/ods` | 下載統整 ODS |
| GET | `/api/map-custom-layers` | 讀取共享地圖圖層 |
| POST | `/api/map-custom-layers` | 上傳共享 CSV 地圖圖層（multipart：`name`、`chart_type`、`file`） |
| POST | `/api/map-custom-layers/from-data` | 從已彙整的年度指標或年齡結構建立共享圖層快照 |
| DELETE | `/api/map-custom-layers/{layer_id}` | 永久刪除共享圖層及其 CSV 來源檔 |

## 離線測試（不下載）

若僅有 `data/samples/` 中的 114 年檔案：

```bash
PYTHONPATH=. python3 -c "
from app.services.pipeline import process_year
print(process_year(114, download=False)['indicators'][:2])
"
```

## 手動補檔

若某年份下載連結缺失，請將政府 ODS 放入：

```
data/raw/{民國年}/114-m31(16).ods
data/raw/{民國年}/114-m11(12).ods
```

再重新執行彙整即可。
