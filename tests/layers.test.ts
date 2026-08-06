import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultProject } from "../src/data/default-project";
import { effectivePinStyle, setPinEditingScope } from "../src/lib/layers";

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
