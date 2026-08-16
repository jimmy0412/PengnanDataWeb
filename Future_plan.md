# React Island 地圖架構與視覺化升級

## 摘要

依照[參考文章](https://allenblog.zeabur.app/frontend/react/react-chart)強調的元件化、資料驅動、GeoJSON 與繪圖職責分離，將 `/map` 改為 React island。FastAPI、Jinja 與其他頁面維持不變；Leaflet 改由 React Leaflet 管理，D3 僅負責尺度與色彩計算。

保留地圖疊圖編輯器定位，繼續讓使用者手動選擇長條圖、圓餅圖或甜甜圈圖，但改善跨里比較、圖例、互動、匯出與程式可維護性。

## 架構與實作

- 新增 Vite＋React JavaScript 前端，將地圖拆成：
  - API client 與 V2 DTO 正規化。
  - reducer/store：年份、圖層順序、顯示狀態、選取里別、顏色、標籤位置及匯出狀態。
  - 地理工具：里名正規化、polygon 內部點與 GeoJSON 對應。
  - Leaflet adapters：底圖、圖表、地名、pane 與事件生命週期。
  - React 元件：地圖畫布、圖層清單、圖例、資訊面板、建立圖層表單及 PNG 匯出面板。
- Jinja 僅輸出 React mount point 與初始設定；網站導覽、FastAPI 路由及其他既有頁面不改。
- Leaflet、React Leaflet、D3 scale/color 與 PNG 匯出套件由 npm 鎖版並打包，不再依賴地圖頁的 CDN script。
- Vite 固定輸出至 `static/dist`，提供 `build`、`build --watch`、測試指令；正式執行仍只需 FastAPI，Node 僅用於建置。
- 功能對等後移除舊的單體 `static/js/map.js`，避免兩套狀態與 Leaflet instance 同時存在。

## V2 API 與資料格式

- 直接切換為：
  - `GET/POST /api/v2/map-layers`
  - `POST /api/v2/map-layers/from-data`
  - `DELETE /api/v2/map-layers/{id}`
- 移除舊 `/api/map-custom-layers*` 端點，不長期維護雙格式。
- Catalog 改為 `{schema_version: 2, layers: [...]}`；每個圖層統一包含：
  - `id`、`name`、`kind`、`created_at`
  - `visualization.type`：`bar | pie | donut`
  - `visualization.scale`：固定為 `global`
  - 帶穩定色彩的 `series`
  - 以里名索引的有限數值 `values`
  - 結構化 `source`：CSV 檔案或既有資料的年份、資料類型、性別、指標
- 首次讀取舊 list catalog 時，先建立備份，再以暫存檔＋原子替換轉成 V2；CSV 原始檔不搬動。轉換失敗時保留舊檔並回報明確錯誤。
- localStorage 升級為新版 namespace，單次轉換既有圖層排序、顯示狀態、區域色彩及地名位置；不存在或無效的圖層 ID 自動忽略。

## 核心視覺化升級

- 同一圖層的七里共用全域尺度：
  - 長條圖共用相同 Y 軸最大值與零基準，支援負值。
  - 圓餅／甜甜圈的切片呈現構成，圖形面積依各里總量相對全域最大值縮放。
- 維持使用者手動選擇三種圖型，不自動合併年齡組；多系列以可捲動完整圖例、hover/focus tooltip 顯示，避免將所有文字塞入小圖標。
- 使用色盲友善且具足夠對比的固定系列色盤；同一系列在地圖、圖例、tooltip 與 PNG 中保持同色。
- 圖標依縮放層級限制最小／最大尺寸，地名維持獨立可拖曳圖層；選取圖表後提高該里邊界對比並在資訊面板顯示完整數值、來源、年份與單位。
- 加入鍵盤焦點、ARIA 標籤、載入骨架、空資料與錯誤狀態；拖曳排序提供按鈕式上移／下移替代操作。
- PNG 匯出使用與畫面相同的 React/Leaflet 圖層樹，在固定 16:9 高解析畫布重新計算全域尺度與字級，完成或失敗後可靠還原地圖狀態。

## 測試與驗收

- Python 測試：V1 catalog 遷移、備份與原子寫入、V2 schema 驗證、CSV／既有資料建立、刪除及來源檔清理、舊端點移除。
- Vitest 測試：全域尺度、負值、全零資料、圓餅面積縮放、系列配色、GeoJSON 內部點、reducer 與 localStorage 遷移。
- React Testing Library：年份切換、圖層顯示與排序、表單錯誤、刪除確認、圖例與資訊面板。
- 瀏覽器整合驗收：
  - 七里 GeoJSON、圖表與地名均能顯示並正確疊放。
  - 同圖層數值可透過共同尺度直接比較。
  - 20 個年齡系列仍可完整查閱，不遮蔽主要地圖操作。
  - 2560×1440 PNG 的構圖、比例、色彩與文字和畫面一致。
  - 桌面與窄螢幕皆可操作，API 或圖資失敗時不造成整頁空白。

## 假設

- React 只用於 `/map`，不重寫其他頁面。
- GeoJSON 維持現有 WGS84 資料與七里範圍，不改用 TopoJSON。
- 圖表型態仍限定 `bar`、`pie`、`donut`；第一階段不加入時間動畫、分級設色或自動推薦圖型。
- V2 為破壞性 API 切換，但既有 catalog 與瀏覽器設定會自動遷移。
