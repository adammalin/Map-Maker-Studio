import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultProject } from "../src/data/default-project";
import { createCustomPinDesign } from "../src/lib/custom-pin";
import { parseProjectText, serializeProject } from "../src/lib/project";
import { PROJECT_SCHEMA, PROJECT_SCHEMA_VERSION } from "../src/types";
import { createLocationLabel } from "../src/lib/callouts";

test("project JSON round-trips all map and location fields", () => {
  const source = createDefaultProject();
  source.map.showCountyLines = true;
  source.map.stateColors["47"] = "#7dba00";
  source.locations[0].customData = { owner: "West team", priority: 2, active: true };
  source.locations[0].visible = false;
  source.locations[0].callout.labels.push(createLocationLabel("company", "Example Company", {
    fontFamily: "Georgia",
    fontSize: 14,
    color: "#00454d",
  }));
  source.locations[0].callout.offsetX = 91;
  source.locations[0].callout.leaderLine = "elbow";
  const restored = parseProjectText(serializeProject(source));
  assert.equal(restored.schema, PROJECT_SCHEMA);
  assert.equal(restored.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(restored.locations.length, 8);
  assert.equal(restored.map.showCountyLines, true);
  assert.equal(restored.map.stateColors["47"], "#7dba00");
  assert.deepEqual(restored.locations[0].customData, { owner: "West team", priority: 2, active: true });
  assert.equal(restored.locations[0].visible, false);
  assert.equal(restored.locations[0].callout.labels[1].text, "Example Company");
  assert.equal(restored.locations[0].callout.labels[1].fontFamily, "Georgia");
  assert.equal(restored.locations[0].callout.labels[1].fontSize, 14);
  assert.equal(restored.locations[0].callout.offsetX, 91);
  assert.equal(restored.locations[0].callout.leaderLine, "elbow");
  assert.equal(restored.layers[0].id, source.layers[0].id);
  assert.equal(restored.locations[0].layerId, source.layers[0].id);
});

test("project JSON stores each location with the effective shared pin size", () => {
  const source = createDefaultProject();
  source.sharedPinStyle.pinSize = 34;
  source.locations.forEach((location) => { location.pinSize = 7; });

  const serialized = JSON.parse(serializeProject(source));

  assert.equal(serialized.sharedPinStyle.pinSize, 34);
  assert.ok(serialized.locations.every((location: { pinSize: number }) => location.pinSize === 34));
  assert.ok(source.locations.every((location) => location.pinSize === 7), "serialization does not mutate the live project");
});

test("project parser rejects unrelated JSON", () => {
  assert.throws(() => parseProjectText('{"name":"not a project"}'), /not a USA Map Studio project/i);
});

test("project parser rejects invalid coordinates", () => {
  const source = createDefaultProject();
  source.locations[0].latitude = 120;
  assert.throws(() => parseProjectText(JSON.stringify(source)), /invalid latitude/i);
});

test("project JSON embeds custom SVG pins and restores location assignments", () => {
  const source = createDefaultProject();
  source.sharedPinStyle.enabled = false;
  const { design } = createCustomPinDesign(
    '<svg viewBox="0 0 24 24"><path d="M12 1L23 23H1Z" fill="currentColor"/></svg>',
    "Triangle marker.svg",
  );
  source.customPins.push(design);
  source.locations[0].customPinId = design.id;
  const serialized = serializeProject(source);
  const restored = parseProjectText(serialized);
  assert.match(serialized, /Triangle marker/);
  assert.match(serialized, /<svg/);
  assert.equal(restored.customPins.length, 1);
  assert.equal(restored.customPins[0].svg, design.svg);
  assert.equal(restored.locations[0].customPinId, design.id);
});

test("schema version 1 projects migrate to an empty custom pin library", () => {
  const legacy = createDefaultProject() as unknown as Record<string, unknown>;
  legacy.schemaVersion = 1;
  delete legacy.customPins;
  const legacyLocations = legacy.locations as Array<Record<string, unknown>>;
  legacyLocations.forEach((location) => { delete location.customPinId; delete location.callout; });
  const migrated = parseProjectText(JSON.stringify(legacy));
  assert.equal(migrated.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.deepEqual(migrated.customPins, []);
  assert.equal(migrated.locations[0].customPinId, null);
  assert.equal(migrated.layers.length, 1);
  assert.equal(migrated.locations[0].layerId, migrated.layers[0].id);
  assert.equal(migrated.sharedPinStyle.enabled, false);
});

test("schema version 2 projects migrate all locations into one named layer", () => {
  const legacy = createDefaultProject() as unknown as Record<string, unknown>;
  legacy.schemaVersion = 2;
  delete legacy.layers;
  delete legacy.sharedPinStyle;
  const legacyLocations = legacy.locations as Array<Record<string, unknown>>;
  legacyLocations.forEach((location) => { delete location.layerId; delete location.callout; });
  const migrated = parseProjectText(JSON.stringify(legacy));
  assert.equal(migrated.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(migrated.layers[0].name, "Layer 1 - Locations");
  assert.ok(migrated.locations.every((location) => location.layerId === migrated.layers[0].id));
});

test("schema version 3 projects migrate missing location visibility to shown", () => {
  const legacy = createDefaultProject() as unknown as Record<string, unknown>;
  legacy.schemaVersion = 3;
  const legacyLocations = legacy.locations as Array<Record<string, unknown>>;
  legacyLocations.forEach((location) => { delete location.visible; delete location.callout; });
  const migrated = parseProjectText(JSON.stringify(legacy));
  assert.equal(migrated.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.ok(migrated.locations.every((location) => location.visible));
});

test("schema version 4 labels migrate into editable schema version 5 callouts", () => {
  const legacy = createDefaultProject() as unknown as Record<string, unknown>;
  legacy.schemaVersion = 4;
  const legacyLocations = legacy.locations as Array<Record<string, unknown>>;
  legacyLocations.forEach((location) => delete location.callout);
  legacyLocations[0].label = "Seattle office";
  legacyLocations[0].showLabel = false;
  legacyLocations[0].labelColor = "#006ba6";
  legacyLocations[0].labelPosition = "above";

  const migrated = parseProjectText(JSON.stringify(legacy));

  assert.equal(migrated.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(migrated.locations[0].callout.visible, false);
  assert.equal(migrated.locations[0].callout.labels[0].text, "Seattle office");
  assert.equal(migrated.locations[0].callout.labels[0].color, "#006ba6");
  assert.equal(migrated.locations[0].callout.anchor, "middle");
  assert.equal(migrated.locations[0].callout.offsetY, -22);
});

test("project parser rejects locations assigned to missing layers", () => {
  const source = createDefaultProject();
  source.locations[0].layerId = "missing-layer";
  assert.throws(() => parseProjectText(JSON.stringify(source)), /layer that is not embedded/i);
});

test("project parser rejects custom pin references without an embedded asset", () => {
  const source = createDefaultProject();
  source.locations[0].customPinId = "missing-design";
  assert.throws(() => parseProjectText(JSON.stringify(source)), /not embedded in this project/i);
});
