/** Download charts (ECharts / Chart.js) or DOM tables as PNG/JPG. */

function triggerDownload(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function downloadEchart(chart, basename, format) {
  const isJpg = format === "jpg";
  const ext = isJpg ? "jpg" : "png";
  const url = chart.getDataURL({
    type: isJpg ? "jpeg" : "png",
    pixelRatio: 2,
    backgroundColor: "#ffffff",
  });
  triggerDownload(url, `${basename}.${ext}`);
}

function downloadChartJs(chart, basename, format) {
  const isJpg = format === "jpg";
  const mime = isJpg ? "image/jpeg" : "image/png";
  const url = chart.toBase64Image(mime, 1);
  triggerDownload(url, `${basename}.${isJpg ? "jpg" : "png"}`);
}

function downloadChart(chart, basename, format) {
  if (!chart) {
    alert("請先載入圖表後再下載。");
    return;
  }
  if (typeof chart.getDataURL === "function") {
    downloadEchart(chart, basename, format);
    return;
  }
  if (typeof chart.toBase64Image === "function") {
    downloadChartJs(chart, basename, format);
    return;
  }
  alert("不支援的圖表類型。");
}

async function downloadElementAsImage(element, basename, format) {
  if (!element) {
    alert("找不到可下載的內容。");
    return;
  }
  if (typeof html2canvas === "undefined") {
    alert("表格匯出模組尚未載入，請重新整理頁面。");
    return;
  }
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    logging: false,
  });
  const isJpg = format === "jpg";
  const mime = isJpg ? "image/jpeg" : "image/png";
  const url = canvas.toDataURL(mime, 0.92);
  triggerDownload(url, `${basename}.${isJpg ? "jpg" : "png"}`);
}

function bindChartExportButtons(
  chartGetter,
  basenameGetter,
  selector = "[data-export-chart]"
) {
  document.querySelectorAll(selector).forEach((btn) => {
    btn.addEventListener("click", () => {
      const format = btn.dataset.exportFormat || "png";
      downloadChart(chartGetter(), basenameGetter(), format);
    });
  });
}

function bindTableExportButtons(basenameGetters = {}) {
  document.querySelectorAll("[data-export-table]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetId = btn.dataset.exportTarget;
      const el = document.getElementById(targetId);
      const wrap = el?.closest(".table-wrap") || el;
      const getter = basenameGetters[targetId];
      const basename = getter ? getter() : btn.dataset.exportBasename || "表格";
      const format = btn.dataset.exportFormat || "png";
      await downloadElementAsImage(wrap, basename, format);
    });
  });
}
