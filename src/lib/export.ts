import PptxGenJS from "pptxgenjs";

export function prepareSvgMarkup(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", "1200");
  clone.setAttribute("height", "720");
  clone.querySelectorAll("[data-editor-only]").forEach((element) => element.remove());
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

function svgDataUri(svgMarkup: string): string {
  const bytes = new TextEncoder().encode(svgMarkup);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

export async function svgToPng(svgMarkup: string, scale = 2): Promise<ArrayBuffer> {
  const image = new Image();
  image.decoding = "async";
  const source = svgDataUri(svgMarkup);
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The SVG preview could not be rasterized."));
    image.src = source;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 1200 * scale;
  canvas.height = 720 * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas export is not available.");
  context.scale(scale, scale);
  context.drawImage(image, 0, 0, 1200, 720);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG export failed.")), "image/png");
  });
  return blob.arrayBuffer();
}

export async function svgToPowerPoint(
  svgMarkup: string,
  title: string,
  projectName: string,
): Promise<ArrayBuffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "USA Map Studio";
  pptx.company = "USA Map Studio";
  pptx.subject = "Editable PowerPoint export of a USA Map Studio project";
  pptx.title = title || projectName;
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
  };
  const slide = pptx.addSlide();
  slide.background = { color: "F3F6F4" };
  slide.addImage({ data: svgDataUri(svgMarkup), x: 0, y: 0, w: 13.333, h: 7.5 });
  slide.addNotes("[Sources]\nBoundary and place-coordinate data: U.S. Census Bureau 2025 Cartographic Boundary and Gazetteer files.\nMap composition: USA Map Studio project export.");
  return pptx.write({ outputType: "arraybuffer" }) as Promise<ArrayBuffer>;
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
