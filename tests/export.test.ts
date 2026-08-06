import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createDefaultProject } from "../src/data/default-project";
import { createCustomPinDesign } from "../src/lib/custom-pin";
import { projectToPowerPoint } from "../src/lib/export";

test("PowerPoint export uses separate editable objects instead of a full-slide image", async () => {
  const project = createDefaultProject();
  project.map.showStateLabels = true;
  project.map.stateColors["47"] = "#fe5000";
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
  assert.match(slideXml, /name="\[Layer 1: Layer 1 - Locations\] Location label - Seattle, WA"/);
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
