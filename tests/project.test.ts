import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultProject } from "../src/data/default-project";
import { createCustomPinDesign } from "../src/lib/custom-pin";
import { parseProjectText, serializeProject } from "../src/lib/project";
import { PROJECT_SCHEMA, PROJECT_SCHEMA_VERSION } from "../src/types";

test("project JSON round-trips all map and location fields", () => {
  const source = createDefaultProject();
  source.map.showCountyLines = true;
  source.map.stateColors["47"] = "#7dba00";
  source.locations[0].customData = { owner: "West team", priority: 2, active: true };
  source.locations[0].visible = false;
  const restored = parseProjectText(serializeProject(source));
  assert.equal(restored.schema, PROJECT_SCHEMA);
  assert.equal(restored.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(restored.locations.length, 8);
  assert.equal(restored.map.showCountyLines, true);
  assert.equal(restored.map.stateColors["47"], "#7dba00");
  assert.deepEqual(restored.locations[0].customData, { owner: "West team", priority: 2, active: true });
  assert.equal(restored.locations[0].visible, false);
  assert.equal(restored.layers[0].id, source.layers[0].id);
  assert.equal(restored.locations[0].layerId, source.layers[0].id);
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
  legacyLocations.forEach((location) => delete location.customPinId);
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
  legacyLocations.forEach((location) => delete location.layerId);
  const migrated = parseProjectText(JSON.stringify(legacy));
  assert.equal(migrated.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(migrated.layers[0].name, "Layer 1 - Locations");
  assert.ok(migrated.locations.every((location) => location.layerId === migrated.layers[0].id));
});

test("schema version 3 projects migrate missing location visibility to shown", () => {
  const legacy = createDefaultProject() as unknown as Record<string, unknown>;
  legacy.schemaVersion = 3;
  const legacyLocations = legacy.locations as Array<Record<string, unknown>>;
  legacyLocations.forEach((location) => delete location.visible);
  const migrated = parseProjectText(JSON.stringify(legacy));
  assert.equal(migrated.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.ok(migrated.locations.every((location) => location.visible));
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
