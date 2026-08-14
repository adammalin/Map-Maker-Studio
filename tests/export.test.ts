import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createDefaultProject } from "../src/data/default-project";
import { createCustomPinDesign } from "../src/lib/custom-pin";
import { projectToPowerPoint } from "../src/lib/export";
import { createLocationLabel } from "../src/lib/callouts";

test("PowerPoint export uses separate editable objects instead of a full-slide image", async () => {
  const project = createDefaultProject();
  project.map.showStateLabels = true;
  project.map.stateColors["47"] = "#fe5000";
  project.locations[0].callout.labels.push(createLocationLabel("company", "Northwest Fabrication", {
    fontFamily: "Arial",
    fontSize: 9,
    fontWeight: 600,
    color: "#00454d",
  }));
  project.locations[0].callout.offsetX = 86;
  project.locations[0].callout.leaderLine = "straight";
  const bytes = new Uint8Array(await projectToPowerPoint(project));
  assert.ok(bytes.byteLength > 100_000);
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);

  const archive = await JSZip.loadAsync(bytes);
  const slideXml = await archive.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(slideXml);
  assert.doesNotMatch(slideXml, /<p:pic>/, "the complete map must not be embedded as one picture");
  assert.ok((slideXml.match(/<a:custGeom>/g) ?? []).length >= 52, "states and boundary layers should be native freeform shapes");
  assert.ok((slideXml.match(/<p:sp>/g) ?? []).length >= 120, "the slide should contain separately editable objects");
  assert.match(slideXml, /name="State - TN - Tennessee"/);
  assert.match(slideXml, /name="Map title"/);
  assert.match(slideXml, /name="\[Layer 1: Layer 1 - Locations\] City label - Seattle, WA"/);
  assert.match(slideXml, /name="\[Layer 1: Layer 1 - Locations\] Company label - Northwest Fabrication"/);
  assert.match(slideXml, /name="\[Layer 1: Layer 1 - Locations\] Leader line 1 - Seattle, WA"/);
  assert.match(slideXml, /typeface="Arial"/);
  const companyShape = (slideXml.match(/<p:sp>.*?<\/p:sp>/gs) ?? [])
    .find((shape) => shape.includes('name="[Layer 1: Layer 1 - Locations] Company label - Northwest Fabrication"'));
  assert.ok(companyShape);
  const companyRunProperties = companyShape.match(/<a:rPr.*?<\/a:rPr>/s)?.[0] ?? "";
  assert.match(companyRunProperties, /sz="675"/, "9 px on the canvas should export as an editable 6.75 pt text run");
  assert.match(companyRunProperties, /b="1"/);
  assert.doesNotMatch(companyRunProperties, /<a:ln\b/, "location text should not receive a PowerPoint text outline");
  assert.match(slideXml, /name="State label - TN"/);
  assert.match(slideXml, /FE5000/i);
  assert.equal(Object.values(archive.files).filter((entry) => entry.name.startsWith("ppt/media/") && !entry.dir).length, 0);
});

test("custom SVG pins remain separate vector objects without flattening the map", async () => {
  const project = createDefaultProject();
  project.sharedPinStyle.enabled = false;
  const { design } = createCustomPinDesign(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1 23 12 12 23 1 12Z"/></svg>',
    "diamond.svg",
  );
  project.customPins.push(design);
  project.locations[0].customPinId = design.id;

  const archive = await JSZip.loadAsync(new Uint8Array(await projectToPowerPoint(project)));
  const slideXml = await archive.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(slideXml);
  assert.equal((slideXml.match(/name="\[Layer 1: Layer 1 - Locations\] Custom pin - Seattle, WA"/g) ?? []).length, 1);
  assert.match(slideXml, /name="State - TN - Tennessee"/);
  assert.ok((slideXml.match(/<a:custGeom>/g) ?? []).length >= 52);
  const media = Object.values(archive.files).filter((entry) => entry.name.startsWith("ppt/media/") && !entry.dir);
  assert.equal(media.filter((entry) => entry.name.endsWith(".svg")).length, 1);
  assert.equal(media.filter((entry) => entry.name.endsWith(".png")).length, 1, "PowerPoint receives one compatibility preview for the custom SVG pin");
});

test("PowerPoint uses the effective shared pin size and preserves custom SVG aspect ratio", async () => {
  const project = createDefaultProject();
  const { design } = createCustomPinDesign(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12"><rect width="24" height="12" fill="currentColor"/></svg>',
    "wide-pin.svg",
  );
  project.customPins.push(design);
  project.sharedPinStyle = {
    enabled: true,
    pinType: "circle",
    customPinId: design.id,
    pinColor: "#ffb000",
    pinSize: 28,
  };
  project.locations.forEach((location) => {
    location.customPinId = null;
    location.pinSize = 8;
  });

  const archive = await JSZip.loadAsync(new Uint8Array(await projectToPowerPoint(project)));
  const slideXml = await archive.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(slideXml);
  const picture = slideXml.match(/<p:pic>.*?name="\[Layer 1: Layer 1 - Locations\] Custom pin - Seattle, WA".*?<\/p:pic>/s)?.[0];
  assert.ok(picture, "the first location should use the effective shared custom pin");
  const extent = picture.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
  assert.ok(extent);
  const maxExtentEmu = Math.round(28 * (7.5 / 720) * 914400);
  assert.ok(Math.abs(Number(extent[1]) - maxExtentEmu) <= 1, "the PowerPoint pin width should match the 28 px canvas size");
  assert.ok(Math.abs(Number(extent[2]) - maxExtentEmu / 2) <= 1, "the custom pin height should preserve its 2:1 viewBox");
});

test("PowerPoint export omits hidden layers and prefixes visible objects for the Selection Pane", async () => {
  const project = createDefaultProject();
  project.layers[0].name = "Layer #1 - US ITER cities";
  project.layers.push({
    id: "layer-io",
    name: "Layer #2 - IO cities",
    description: "ITER Organization contracts",
    visible: false,
    createdAt: new Date().toISOString(),
  });
  project.locations[1].layerId = "layer-io";
  const archive = await JSZip.loadAsync(new Uint8Array(await projectToPowerPoint(project)));
  const slideXml = await archive.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(slideXml);
  assert.match(slideXml, /\[Layer 1: Layer #1 - US ITER cities\] Pin - Seattle, WA/);
  assert.doesNotMatch(slideXml, /San Francisco, CA/);
  const notesXml = await archive.file("ppt/notesSlides/notesSlide1.xml")?.async("string");
  assert.match(notesXml ?? "", /Layer #2 - IO cities \(hidden\)/);
});

test("PowerPoint export omits individually hidden locations without deleting their data", async () => {
  const project = createDefaultProject();
  project.locations[0].visible = false;
  const archive = await JSZip.loadAsync(new Uint8Array(await projectToPowerPoint(project)));
  const slideXml = await archive.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(slideXml);
  assert.doesNotMatch(slideXml, /Seattle, WA/);
  assert.match(slideXml, /San Francisco, CA/);
  assert.match(slideXml, />7 visible locations</);
  assert.equal(project.locations.length, 8);
});
