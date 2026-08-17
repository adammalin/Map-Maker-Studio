import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultProject } from "../src/data/default-project";
import {
  applySharedPinStylePatch,
  effectivePinStyle,
  materializeEffectivePinStyles,
  setPinEditingScope,
  uniqueCityCount,
} from "../src/lib/layers";

test("new projects default to editing one shared style across all pins", () => {
  const project = createDefaultProject();
  assert.equal(project.sharedPinStyle.enabled, true);
  assert.ok(project.locations.every((location) => effectivePinStyle(project, location).pinColor === project.sharedPinStyle.pinColor));
});

test("switching to single-pin editing preserves the shared appearance for every location", () => {
  const project = createDefaultProject();
  project.sharedPinStyle.pinType = "diamond";
  project.sharedPinStyle.pinColor = "#fe5000";
  project.sharedPinStyle.pinSize = 22;

  const single = setPinEditingScope(project, "single", project.locations[0].id);
  assert.equal(single.sharedPinStyle.enabled, false);
  assert.ok(single.locations.every((location) => location.pinType === "diamond"));
  assert.ok(single.locations.every((location) => location.pinColor === "#fe5000"));
  assert.ok(single.locations.every((location) => location.pinSize === 22));
  assert.equal(project.sharedPinStyle.enabled, true, "the source project is not mutated");
});

test("switching back to all-pins editing uses the selected pin as the shared style", () => {
  const project = setPinEditingScope(createDefaultProject(), "single");
  const selected = project.locations[0];
  selected.pinType = "star";
  selected.pinColor = "#006ba6";
  selected.pinSize = 19;

  const all = setPinEditingScope(project, "all", selected.id);
  assert.equal(all.sharedPinStyle.enabled, true);
  assert.deepEqual(effectivePinStyle(all, all.locations[1]), {
    pinType: "star",
    customPinId: null,
    pinColor: "#006ba6",
    pinSize: 19,
  });
});

test("shared pin edits immediately mirror the visible size into every location", () => {
  const project = createDefaultProject();
  project.locations.forEach((location) => { location.pinSize = 8; });

  const updated = applySharedPinStylePatch(project, { pinSize: 27 });

  assert.equal(updated.sharedPinStyle.pinSize, 27);
  assert.ok(updated.locations.every((location) => location.pinSize === 27));
  assert.ok(project.locations.every((location) => location.pinSize === 8), "the source project is not mutated");
});

test("export snapshots materialize effective shared styles without mutating the project", () => {
  const project = createDefaultProject();
  project.sharedPinStyle.pinSize = 31;
  project.locations.forEach((location) => { location.pinSize = 8; });

  const snapshot = materializeEffectivePinStyles(project);

  assert.ok(snapshot.locations.every((location) => location.pinSize === 31));
  assert.ok(project.locations.every((location) => location.pinSize === 8));
});

test("city counts collapse repeated contract rows in the same city and state", () => {
  const project = createDefaultProject();
  project.locations[1].city = `  ${project.locations[0].city.toUpperCase()}  `;
  project.locations[1].state = project.locations[0].state.toLowerCase();

  assert.equal(uniqueCityCount(project.locations), project.locations.length - 1);
});
