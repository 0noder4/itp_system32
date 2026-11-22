import type { MapLegendItem } from "@/lib/mapViews";

const SVG_FONT_FAMILY = '"Segoe UI", Arial, Helvetica, sans-serif';
const DEFAULT_VB_WIDTH = 534.8;
const DEFAULT_VB_HEIGHT = 297.8;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load serialized SVG image"));
    img.src = src;
  });
}

function triggerDownload(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Rasterizes the rendered hall map SVG (plus optional color legend strip)
 * to a crisp high-resolution PNG and downloads it in the browser.
 */
export async function downloadMapSvgAsPng(
  svgElement: SVGSVGElement,
  options: {
    filename: string;
    legendItems?: MapLegendItem[];
    targetWidth?: number;
  }
): Promise<void> {
  const vb = svgElement.viewBox.baseVal;
  const vbWidth = vb && vb.width > 0 ? vb.width : DEFAULT_VB_WIDTH;
  const vbHeight = vb && vb.height > 0 ? vb.height : DEFAULT_VB_HEIGHT;

  const exportWidth = options.targetWidth ?? 2140;
  const exportHeight = Math.round(exportWidth * (vbHeight / vbWidth));

  const clone = svgElement.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(exportWidth));
  clone.setAttribute("height", String(exportHeight));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${vbWidth} ${vbHeight}`);
  }
  clone.setAttribute("font-family", SVG_FONT_FAMILY);
  clone.style.fontFamily = SVG_FONT_FAMILY;

  const svgMarkup = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgMarkup], {
    type: "image/svg+xml;charset=utf-8",
  });
  const svgUrl = URL.createObjectURL(svgBlob);

  let img: HTMLImageElement;
  try {
    img = await loadImage(svgUrl);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }

  const legendItems = options.legendItems ?? [];
  const legendHeight = legendItems.length > 0 ? 84 : 0;

  const canvas = document.createElement("canvas");
  canvas.width = exportWidth;
  canvas.height = exportHeight + legendHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable");
  }

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, exportWidth, exportHeight);

  if (legendItems.length > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, exportHeight, exportWidth, legendHeight);

    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(0, exportHeight, exportWidth, 2);

    ctx.font = `600 26px ${SVG_FONT_FAMILY}`;
    ctx.textBaseline = "middle";

    let x = 40;
    const centerY = exportHeight + legendHeight / 2;
    const swatchSize = 28;

    for (const item of legendItems) {
      ctx.fillStyle = item.color;
      ctx.fillRect(x, centerY - swatchSize / 2, swatchSize, swatchSize);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, centerY - swatchSize / 2, swatchSize, swatchSize);

      x += swatchSize + 14;
      ctx.fillStyle = "#334155";
      ctx.fillText(item.label, x, centerY + 1);
      x += ctx.measureText(item.label).width + 48;
    }
  }

  const pngBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );

  if (pngBlob) {
    const pngUrl = URL.createObjectURL(pngBlob);
    try {
      triggerDownload(pngUrl, options.filename);
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
    }
    return;
  }

  triggerDownload(canvas.toDataURL("image/png"), options.filename);
}
