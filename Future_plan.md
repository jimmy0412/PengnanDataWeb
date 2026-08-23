# React Island 地圖重構計畫

## 摘要

以目前可運作的地圖編輯器為基準，將 `/map` 一次切換為 React island，並以 Vite 管理前端建置。FastAPI、Jinja、其他頁面與既有資料處理流程維持不變；Leaflet 改由 React Leaflet 管理，D3 僅負責尺度與色彩計算。

API 與 catalog 採漸進式 V2 遷移：React 前端只使用 V2，既有 V1 端點則在遷移期間透過相容層繼續運作，待 React 版本穩定後再另行移除。

## 現況基線

目前 `/map` 使用 FastAPI、Jinja、原生 JavaScript、Leaflet 與 SVG，已具備：

- 七里 GeoJSON 實心底圖、人口圖表與共享圖表圖層。
- 圖層顯示切換、拖曳排序及共享圖層永久刪除。
- 從既有年度資料建立共享快照，以及上傳 CSV 建立共享圖層。
- 各里色彩設定、可拖曳地名及瀏覽器 localStorage 儲存。
- 固定 16:9 地圖畫布與 2560×1440 PNG 匯出。
- 桌面與窄螢幕版面，以及可獨立收合的工作區區塊。

現有 15 項 Python 測試皆通過。重構期間必須維持上述功能與測試，不把已完成項目重新列為新增功能。

## 待改善項目

- 同一圖層的七里圖表目前各自縮放，無法直接比較；長條圖也缺少一致的正負值零基準。
- 圓餅與甜甜圈目前只呈現構成，圖形大小未反映各里總量差異。
- 多系列圖例只顯示單一色彩提示，缺少完整系列、數值 tooltip 與可選取的詳細資訊。
- 圖層排序主要依賴滑鼠拖曳，尚無完整的鍵盤替代操作與焦點互動。
- PNG 匯出依賴計時器還原狀態，錯誤處理與自動化驗證仍不足。
- 前端繪圖、狀態與 Leaflet 生命週期集中於單一檔案，缺少可獨立測試的模組。

## React 前端架構

- 新增 Vite＋React JavaScript 前端，將地圖拆成：
  - API client 與 V2 DTO 正規化。
  - reducer/store：年份、圖層順序、顯示狀態、選取里別、色彩、地名位置與匯出狀態。
  - 地理工具：里名正規化、polygon 內部點與 GeoJSON 對應。
  - 視覺化工具：共同尺度、固定系列色盤、長條與圓餅尺寸計算。
  - Leaflet adapters：底圖、圖表、地名、pane 與事件生命週期。
  - React 元件：地圖畫布、圖層清單、完整圖例、資訊面板、建立圖層表單及 PNG 匯出面板。
- Jinja 僅輸出 React mount point 與初始設定；網站導覽、FastAPI 路由及其他頁面不改。
- React、React Leaflet、Leaflet、D3 scale/color 與 PNG 匯出套件由 npm 鎖版並打包，不再讓 React 地圖依賴 CDN script。
- Vite 固定輸出至 `static/dist`，提供開發、正式建置、watch 與前端測試指令。正式執行仍只需 FastAPI，Node 僅用於開發、建置及測試。
- React 版本達成功能對等並通過驗收後，才移除舊 `static/js/map.js` 與地圖頁 CDN 依賴，避免同時建立兩個 Leaflet instance。

## V2 API 與資料格式

新增下列端點，React 前端只使用 V2：

- `GET /api/v2/map-layers`
- `POST /api/v2/map-layers`
- `POST /api/v2/map-layers/from-data`
- `DELETE /api/v2/map-layers/{id}`

V2 catalog 統一為 `{schema_version: 2, layers: [...]}`。每個圖層包含：

- `id`、`name`、`kind`、`created_at`。
- `visualization.type`：`bar | pie | donut`。
- `visualization.scale`：第一階段固定為 `global`。
- 帶穩定識別與固定色彩的 `series`。
- 以里名索引、只包含有限數值的 `values`。
- 結構化 `source`：CSV 檔案，或既有資料的年份、資料類型、性別及指標。

資料驗證規則：

- 長條圖接受有限正值、零與負值。
- 圓餅圖與甜甜圈圖只接受有限非負值；建立或上傳時若包含負值，由 API 明確拒絕，不在前端靜默改成零或絕對值。
- 圖層名稱、圖表類型、系列名稱、里別與來源資訊均由後端驗證，前端錯誤訊息直接呈現 API 的可讀說明。

## 漸進遷移與相容策略

- 首次透過 V2 讀取舊 list catalog 時，先建立帶時間戳的備份，再轉換為 V2 schema。
- 新 catalog 先寫入同目錄暫存檔，完成序列化與驗證後再原子替換；任何步驟失敗都保留舊檔並回報明確錯誤。
- CSV 原始檔不搬動；遷移只轉換 catalog metadata 與資料結構。
- 遷移期間保留現有 `/api/map-custom-layers*` 端點。V1 與 V2 共用同一份 V2 catalog，V1 端點透過 adapter 接受及回傳舊格式，避免維護兩份資料來源。
- V1 端點移除不包含在 React 首次上線範圍內；待 React 版本通過功能對等與瀏覽器驗收後，另立清理里程碑移除 V1 adapter、舊 API 測試及文件。
- localStorage 改用新版 namespace，首次載入時單次轉換既有圖層排序、顯示狀態、區域色彩及地名位置；不存在的圖層 ID、重複項目與格式錯誤資料自動忽略。

## 核心視覺化與互動

- 同一圖層的七里使用共同尺度：
  - 長條圖共用相同數值範圍與零基準，正負值分列零線兩側；全零資料使用穩定的退化尺度。
  - 圓餅與甜甜圈的切片呈現系列構成，圖形面積依各里非負總量相對全域最大值縮放；全零里顯示明確的無資料狀態。
- 維持使用者手動選擇長條、圓餅或甜甜圈，不自動合併年齡組。
- 多系列使用可捲動的完整圖例；同一系列在地圖、圖例、tooltip、資訊面板與 PNG 中保持相同的色盲友善固定色彩。
- 圖表支援 hover 與鍵盤 focus tooltip。選取圖表後提高對應里界線對比，並在資訊面板顯示完整系列數值、來源、年份與單位。
- 圖表尺寸依地圖縮放層級限制最小值與最大值；地名維持獨立、可拖曳的圖層。
- 加入 ARIA 標籤、載入骨架、空資料與局部錯誤狀態；圖層拖曳排序同時提供上移／下移按鈕。
- PNG 匯出沿用畫面相同的 React/Leaflet 圖層樹，在固定 16:9 高解析畫布重新計算共同尺度、圖表尺寸與字級；成功、失敗或逾時都必須還原中心、縮放、容器尺寸、選取狀態及控制項狀態。

## 實作里程碑

1. 建立 V2 schema、catalog 遷移、原子寫入與 V1 adapter，確保既有 API 與測試繼續運作。
2. 建立 Vite/React 專案與可測試的資料、尺度、GeoJSON、reducer 及 localStorage 模組。
3. 完成 React Leaflet 地圖與所有既有功能，將 `/map` 切換至 React bundle。
4. 加入共同尺度、完整圖例、tooltip、選取資訊、鍵盤操作與可靠 PNG 匯出。
5. 通過 Python、前端單元、元件及瀏覽器驗收後，移除舊地圖 JavaScript 與 CDN；V1 API 留待後續獨立清理。

## 測試與驗收

- Python 測試：V1→V2 遷移、備份與原子寫入、V2 schema 驗證、V1/V2 相容讀寫、CSV／既有資料建立、負值規則、刪除、來源檔清理及錯誤回應。
- Vitest：共同尺度、正負值、全零資料、圓餅面積縮放、固定系列配色、GeoJSON 內部點、reducer 與 localStorage 遷移。
- React Testing Library：年份切換、圖層顯示與排序、上移／下移、表單錯誤、刪除確認、圖例、tooltip 與資訊面板。
- 瀏覽器整合驗收：
  - 七里 GeoJSON、圖表與地名均能顯示並正確疊放。
  - 同圖層數值可透過共同尺度直接比較。
  - 20 個年齡系列仍可完整查閱，不遮蔽主要地圖操作。
  - 桌面與窄螢幕皆可操作，API、共享圖層或圖資失敗時不造成整頁空白。
  - 2560×1440 PNG 的構圖、比例、色彩與文字和畫面一致，匯出完成或失敗後地圖狀態完整還原。
- 遷移完成前，現有 15 項 Python 測試必須持續通過。

## 假設與非目標

- React 前端維持 JavaScript，不額外導入 TypeScript。
- React 只用於 `/map`，不重寫其他頁面。
- GeoJSON 維持現有 WGS84 資料與七里範圍，不改用 TopoJSON。
- 圖表型態仍限定 `bar`、`pie`、`donut`。
- 第一階段不加入時間動畫、分級設色、自動推薦圖型或使用者權限系統。
