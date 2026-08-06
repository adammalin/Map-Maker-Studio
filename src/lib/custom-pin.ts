import {
  DOMParser,
  XMLSerializer,
  type Document as XmlDocument,
  type Element as XmlElement,
  type Node as XmlNode,
} from "@xmldom/xmldom";
import type { CustomPinDesign } from "../types";

const MAX_SVG_BYTES = 500_000;
const MAX_ELEMENTS = 2_000;
const MAX_DEPTH = 40;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "defs",
  "clippath",
  "mask",
  "lineargradient",
  "radialgradient",
  "stop",
  "symbol",
  "use",
  "title",
  "desc",
]);

const VISIBLE_ELEMENTS = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "use",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "id",
  "viewbox",
  "preserveaspectratio",
  "d",
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "points",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "clip-rule",
  "clip-path",
  "mask",
  "opacity",
  "transform",
  "vector-effect",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientunits",
  "gradienttransform",
  "spreadmethod",
  "fx",
  "fy",
  "fr",
  "href",
]);

export interface SanitizedCustomPin {
  svg: string;
  viewBox: string;
  removedItems: number;
}

function parseViewBox(root: XmlElement): [number, number, number, number] {
  const supplied = root.getAttribute("viewBox") ?? root.getAttribute("viewbox") ?? "";
  const values = supplied.trim().split(/[\s,]+/).map(Number);
  if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
    return values as [number, number, number, number];
  }
  const width = Number.parseFloat(root.getAttribute("width") ?? "");
  const height = Number.parseFloat(root.getAttribute("height") ?? "");
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return [0, 0, width, height];
  }
  throw new Error("The custom pin SVG needs a valid viewBox or numeric width and height.");
}

function safeAttributeValue(name: string, value: string): boolean {
  if (!value || value.length > 4_096 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return false;
  const normalized = value.toLowerCase().replace(/\s+/g, "");
  if (/javascript:|vbscript:|data:|https?:|file:|\\\\|\/\//i.test(normalized)) return false;
  if (name === "href") return /^#[A-Za-z_][\w:.-]*$/.test(value.trim());
  if (name === "id") return /^[A-Za-z_][\w:.-]*$/.test(value.trim());
  if (/url\(/i.test(value)) {
    const withoutInternalReferences = value.replace(/url\(\s*#[A-Za-z_][\w:.-]*\s*\)/gi, "");
    if (/url\(/i.test(withoutInternalReferences)) return false;
  }
  return true;
}

function removeNode(node: XmlNode): void {
  node.parentNode?.removeChild(node);
}

export function sanitizeCustomPinSvg(source: string): SanitizedCustomPin {
  if (typeof source !== "string" || !source.trim()) throw new Error("The custom pin SVG is empty.");
  if (new TextEncoder().encode(source).byteLength > MAX_SVG_BYTES) {
    throw new Error("The custom pin SVG exceeds the 500 KB project-embedding limit.");
  }
  if (/<!doctype|<!entity|<\?xml-stylesheet/i.test(source)) {
    throw new Error("The custom pin SVG contains a document type, entity, or stylesheet declaration that is not allowed.");
  }

  let document: XmlDocument;
  try {
    document = new DOMParser({
      onError(level, message) {
        if (level !== "warning") throw new Error(message);
      },
    }).parseFromString(source, "image/svg+xml");
  } catch {
    throw new Error("The custom pin file is not well-formed SVG XML.");
  }
  const root = document.documentElement;
  if (!root || (root.localName ?? root.nodeName).toLowerCase() !== "svg") throw new Error("The selected file does not contain an SVG root element.");
  const viewBoxValues = parseViewBox(root);
  const viewBox = viewBoxValues.join(" ");
  let elementCount = 0;
  let visibleCount = 0;
  let removedItems = 0;

  function clean(element: XmlElement, depth: number): void {
    if (depth > MAX_DEPTH) throw new Error("The custom pin SVG is nested too deeply.");
    elementCount += 1;
    if (elementCount > MAX_ELEMENTS) throw new Error("The custom pin SVG contains more than 2,000 elements.");
    const elementName = (element.localName ?? element.nodeName).toLowerCase();
    if (VISIBLE_ELEMENTS.has(elementName)) visibleCount += 1;

    for (let index = element.attributes.length - 1; index >= 0; index -= 1) {
      const attribute = element.attributes.item(index);
      if (!attribute) continue;
      const rawName = attribute.name;
      const name = rawName.toLowerCase();
      if (name === "xmlns" || name.startsWith("xmlns:")) {
        if (element !== root) {
          element.removeAttribute(rawName);
          removedItems += 1;
        }
        continue;
      }
      if (name === "xlink:href") {
        if (safeAttributeValue("href", attribute.value)) element.setAttribute("href", attribute.value);
        element.removeAttribute(rawName);
        removedItems += 1;
        continue;
      }
      if (!ALLOWED_ATTRIBUTES.has(name) || !safeAttributeValue(name, attribute.value)) {
        element.removeAttribute(rawName);
        removedItems += 1;
      }
    }

    for (let index = element.childNodes.length - 1; index >= 0; index -= 1) {
      const child = element.childNodes.item(index);
      if (!child) continue;
      if (child.nodeType === 1) {
        const childElement = child as XmlElement;
        if (!ALLOWED_ELEMENTS.has((childElement.localName ?? childElement.nodeName).toLowerCase())) {
          removeNode(childElement);
          removedItems += 1;
        } else {
          clean(childElement, depth + 1);
        }
      } else if (child.nodeType === 3) {
        if (!["title", "desc"].includes(elementName) && child.nodeValue?.trim()) {
          removeNode(child);
          removedItems += 1;
        }
      } else {
        removeNode(child);
        removedItems += 1;
      }
    }
  }

  clean(root, 0);
  if (visibleCount === 0) throw new Error("The custom pin SVG does not contain a supported visible vector shape.");
  root.setAttribute("xmlns", SVG_NAMESPACE);
  root.setAttribute("viewBox", viewBox);
  root.removeAttribute("viewbox");
  root.removeAttribute("width");
  root.removeAttribute("height");
  const svg = new XMLSerializer().serializeToString(root, { requireWellFormed: true });
  return { svg, viewBox, removedItems };
}

export function createCustomPinDesign(source: string, fileName: string): {
  design: CustomPinDesign;
  removedItems: number;
} {
  const sanitized = sanitizeCustomPinSvg(source);
  const name = fileName.replace(/\.svg$/i, "").trim().slice(0, 120) || "Custom pin";
  return {
    design: {
      id: `custom-pin-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`,
      name,
      svg: sanitized.svg,
      viewBox: sanitized.viewBox,
      createdAt: new Date().toISOString(),
    },
    removedItems: sanitized.removedItems,
  };
}

export function customPinInnerMarkup(design: CustomPinDesign): string {
  const start = design.svg.indexOf(">");
  const end = design.svg.toLowerCase().lastIndexOf("</svg>");
  return start >= 0 && end > start ? design.svg.slice(start + 1, end) : "";
}

export function customPinTransform(viewBox: string, size: number): string {
  const [minX, minY, width, height] = viewBox.split(/[\s,]+/).map(Number);
  const scale = size / Math.max(width, height);
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;
  return `scale(${scale}) translate(${-centerX} ${-centerY})`;
}
