function showOdsLinks(data) {
  const wrap = document.getElementById("ods-links");
  if (!wrap) return;
  const hasAge = data?.ods_age_path || data?.ods_path;
  const hasInd = data?.ods_indicators_path;
  if (hasAge || hasInd) {
    wrap.classList.remove("hidden");
  }
}

async function runProcess() {
  const btn = document.getElementById("btn-process");
  const text = document.getElementById("years-input").value.trim();
  btn.disabled = true;
  logTo("log", `開始處理：${text}`);
  try {
    const res = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ years_text: text, download: true }),
    });
    const contentType = res.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const message = (await res.text()).trim();
      throw new Error(message || `伺服器回應異常（HTTP ${res.status}）`);
    }
    if (!res.ok) throw new Error(data.detail || `處理失敗（HTTP ${res.status}）`);
    const completed = data.processed_this_run ?? data.processed_years ?? [];
    if (completed.length) {
      logTo("log", `完成：已處理 ${completed.join(", ")} 年`);
    } else {
      logTo("log", "未能完成任何年份，請查看下方錯誤訊息。");
    }
    if (data.warnings?.length) logTo("log", "警告：\n" + data.warnings.join("\n"));
    if (data.errors?.length) logTo("log", "錯誤：\n" + data.errors.join("\n"));
    showOdsLinks(data);
    updateStatusText(data.processed_years || []);
  } catch (err) {
    logTo("log", `失敗：${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

function updateStatusText(years) {
  const el = document.getElementById("status-text");
  if (!el) return;
  if (!years.length) {
    el.textContent = "尚未彙整任何年份，請先執行下載與彙整。";
    return;
  }
  el.textContent = `已處理年份：${years.join("、")}。可前往其他頁面檢視圖表與表格。`;
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("btn-process").addEventListener("click", runProcess);
  try {
    const status = await fetchStatus();
    updateStatusText(status.processed_years || []);
    showOdsLinks(status);
  } catch {
    updateStatusText([]);
  }
});
