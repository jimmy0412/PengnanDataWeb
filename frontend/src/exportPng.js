import { toPng } from "html-to-image";

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export function pngExportOptions(width, backgroundColor) {
  return {
    canvasWidth: width,
    canvasHeight: Math.round(width * 9 / 16),
    pixelRatio: 1,
    cacheBust: true,
    backgroundColor,
  };
}

export async function captureMapPng(node, width, backgroundColor, timeoutMs = 20000) {
  let timeoutId;
  node.classList.add("map-exporting");
  try {
    await nextFrame();
    const render = toPng(node, pngExportOptions(width, backgroundColor));
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error("匯出逾時")), timeoutMs);
    });
    return await Promise.race([render, timeout]);
  } finally {
    window.clearTimeout(timeoutId);
    node.classList.remove("map-exporting");
  }
}
