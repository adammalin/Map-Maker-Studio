import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultProject } from "../src/data/default-project";
import { parseProjectText, serializeProject } from "../src/lib/project";
import { PROJECT_SCHEMA, PROJECT_SCHEMA_VERSION } from "../src/types";

test("project JSON round-trips all map and location fields", () => {
  const source = createDefaultProject();
  source.map.showCountyLines = true;
  source.map.stateColors["47"] = "#7dba00";
  source.locations[0].customData = { owner: "West team", priority: 2, active: true };
  const restored = parseProjectText(serializeProject(source));
  assert.equal(restored.schema, PROJECT_SCHEMA);
  assert.equal(restored.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(restored.locations.length, 8);
  assert.equal(restored.map.showCountyLines, true);
  assert.equal(restored.map.stateColors["47"], "#7dba00");
  assert.deepEqual(restored.locations[0].customData, { owner: "West team", priority: 2, active: true });
});

test("project parser rejects unrelated JSON", () => {
  assert.throws(() => parseProjectText('{"name":"not a project"}'), /not a USA Map Studio project/i);
});

test("project parser rejects invalid coordinates", () => {
  const source = createDefaultProject();
  source.locations[0].latitude = 120;
  assert.throws(() => parseProjectText(JSON.stringify(source)), /invalid latitude/i);
});
