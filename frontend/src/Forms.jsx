import { useState } from "react";

const metrics = ["總人口", "扶老比", "出生率", "自然增加率", "年出生", "年死亡"];
export function CreateForms({ years, api, refresh }) {
  const [existingStatus, setExistingStatus] = useState(""), [uploadStatus, setUploadStatus] = useState("");
  const submitExisting = async (event) => { event.preventDefault(); const form = event.currentTarget, data = Object.fromEntries(new FormData(form)); data.year = Number(data.year); if (data.data_type === "age") data.metric = null; setExistingStatus("正在建立…"); try { await api.fromData(data); form.reset(); setExistingStatus("已建立共享圖層。"); await refresh(); } catch (error) { setExistingStatus(`建立失敗：${error.message}`); } };
  const submitUpload = async (event) => { event.preventDefault(); const form = event.currentTarget; setUploadStatus("正在上傳並驗證…"); try { await api.upload(new FormData(form)); form.reset(); setUploadStatus("已新增共享圖層。"); await refresh(); } catch (error) { setUploadStatus(`上傳失敗：${error.message}`); } };
  return <>
    <details className="custom-layer-form" open><summary>使用現有資料</summary><form className="map-workspace-form" onSubmit={submitExisting}>
      <label className="field">圖層名稱<input name="name" required maxLength="100"/></label><label className="field">年份<select name="year" required>{years.map((year) => <option key={year}>{year}</option>)}</select></label><label className="field">資料類型<select name="data_type"><option value="indicators">年度指標</option><option value="age">年齡結構</option></select></label><label className="field">指標<select name="metric">{metrics.map((metric) => <option key={metric}>{metric}</option>)}</select></label><label className="field">性別<select name="gender"><option>全部</option><option>男</option><option>女</option></select></label><label className="field">圖表類型<select name="chart_type"><option value="bar">長條圖</option><option value="pie">圓餅圖</option><option value="donut">甜甜圈圖</option></select></label><button disabled={!years.length}>建立共享圖層</button>
    </form><p className="hint form-status" role="status">{existingStatus}</p></details>
    <details className="custom-layer-form"><summary>上傳 CSV</summary><p className="hint">CSV 必須有「里」欄位，其餘欄位為數值資料。</p><form className="map-workspace-form" onSubmit={submitUpload}><label className="field">圖層名稱<input name="name" required maxLength="100"/></label><label className="field">圖表類型<select name="chart_type"><option value="bar">長條圖</option><option value="pie">圓餅圖</option><option value="donut">甜甜圈圖</option></select></label><label className="field">CSV 檔案<input name="file" type="file" accept=".csv,text/csv" required/></label><button>上傳圖層</button></form><p className="hint form-status" role="status">{uploadStatus}</p></details>
  </>;
}
