function showOdsLinks(data) {
  const wrap = document.getElementById("ods-links");
  if (!wrap) return;
  const hasAge = Boolean(data?.ods_age_path || data?.ods_path);
  const hasInd = Boolean(data?.ods_indicators_path);
  document.getElementById("ods-download-age")?.classList.toggle("hidden", !hasAge);
  document.getElementById("ods-download-indicators")?.classList.toggle("hidden", !hasInd);
  wrap.classList.toggle("hidden", !hasAge && !hasInd);
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : { detail: (await response.text()).trim() };
  if (!response.ok) {
    throw new Error(data.detail || `伺服器回應異常（HTTP ${response.status}）`);
  }
  return data;
}

function setControlsBusy(busy) {
  document.getElementById("btn-process").disabled = busy;
  document.getElementById("years-input").disabled = busy;
  document.getElementById("delete-year").disabled = busy;
  const deleteButton = document.getElementById("btn-delete-year");
  deleteButton.disabled = busy || !document.getElementById("delete-year").value;
}

function updateProgress(job) {
  const wrap = document.getElementById("job-progress");
  const percent = Number(job.percent || 0);
  wrap.classList.remove("hidden");
  document.getElementById("progress-stage").textContent = job.stage || "處理中…";
  document.getElementById("progress-percent").textContent = `${percent}%`;
  const bar = document.getElementById("progress-bar");
  bar.value = percent;
  bar.textContent = `${percent}%`;
}

async function waitForJob(jobId) {
  let previousStage = "";
  while (true) {
    const job = await jsonRequest(`/api/jobs/${jobId}`);
    updateProgress(job);
    if (job.stage && job.stage !== previousStage) {
      logTo("log", job.stage);
      previousStage = job.stage;
    }
    if (job.status === "completed") return job.result;
    if (job.status === "failed") throw new Error(job.error || "工作執行失敗");
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}

async function refreshPageStatus() {
  const status = await fetchStatus();
  const years = status.processed_years || [];
  updateStatusText(years);
  fillYearSelect("delete-year", years);
  showOdsLinks(status);
  setControlsBusy(false);
  return status;
}

async function startJob(url, payload) {
  setControlsBusy(true);
  try {
    const job = await jsonRequest(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    updateProgress(job);
    return await waitForJob(job.id);
  } finally {
    setControlsBusy(false);
  }
}

async function runProcess() {
  const text = document.getElementById("years-input").value.trim();
  logTo("log", `開始處理：${text}`);
  try {
    const data = await startJob("/api/jobs/process", {
      years_text: text,
      download: true,
    });
    const completed = data.processed_this_run ?? [];
    if (completed.length) {
      logTo("log", `完成：已處理 ${completed.join("、")} 年`);
    } else {
      logTo("log", "未能完成任何年份，請查看下方錯誤訊息。");
    }
    if (data.warnings?.length) logTo("log", `警告：\n${data.warnings.join("\n")}`);
    if (data.errors?.length) logTo("log", `錯誤：\n${data.errors.join("\n")}`);
    await refreshPageStatus();
  } catch (error) {
    logTo("log", `失敗：${error.message}`);
  }
}

async function runDeleteYear() {
  const year = Number(document.getElementById("delete-year").value);
  if (!year) return;
  const confirmed = window.confirm(
    `確定刪除民國 ${year} 年的原始檔、彙整資料及相關地圖快照？此操作無法復原。`
  );
  if (!confirmed) return;

  logTo("log", `開始刪除：${year} 年`);
  try {
    const data = await startJob("/api/jobs/delete-year", { year });
    logTo(
      "log",
      `完成：已刪除 ${data.deleted_year} 年，並移除 ${data.removed_map_layers} 個相關地圖圖層。`
    );
    await refreshPageStatus();
  } catch (error) {
    logTo("log", `刪除失敗：${error.message}`);
  }
}

function updateStatusText(years) {
  const element = document.getElementById("status-text");
  if (!element) return;
  if (!years.length) {
    element.textContent = "尚未彙整任何年份，請先執行下載與彙整。";
    return;
  }
  element.textContent = `已處理年份：${years.join("、")}。可前往其他頁面檢視圖表與表格。`;
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("btn-process").addEventListener("click", runProcess);
  document.getElementById("btn-delete-year").addEventListener("click", runDeleteYear);
  try {
    await refreshPageStatus();
  } catch {
    updateStatusText([]);
    setControlsBusy(false);
  }
});
