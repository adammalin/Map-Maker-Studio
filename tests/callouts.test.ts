import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultProject } from "../src/data/default-project";
import {
  arrangeProjectCallouts,
  calloutConnector,
  createLocationLabel,
  enableProjectLocationLabels,
  findCalloutOverlaps,
  findLeaderLineCrossings,
  materializeLabelDisplay,
  measureCallout,
} from "../src/lib/callouts";

test("multi-row callouts measure City and Company labels independently", () => {
  const project = createDefaultProject();
  const callout = project.locations[0].callout;
  callout.labels.push(createLocationLabel("company", "Northwest Fabrication", {
    fontFamily: "Arial",
    fontSize: 9,
    fontWeight: 600,
  }));

  const metrics = measureCallout(callout);

  assert.equal(metrics.rows.length, 2);
  assert.equal(metrics.rows[1].label.role, "company");
  assert.ok(metrics.width >= metrics.rows[0].width);
  assert.ok(metrics.height > metrics.rows[0].height);
});

test("automatic arrangement removes collisions for dense locations", () => {
  const project = createDefaultProject();
  project.locations.forEach((location, index) => {
    location.latitude = 40.7128;
    location.longitude = -74.006;
    location.callout.labels[0].text = `Dense location ${index + 1}`;
    location.callout.offsetX = 18;
    location.callout.offsetY = 0;
    location.callout.anchor = "start";
    location.callout.placementMode = "auto";
    location.callout.locked = false;
  });
  assert.ok(findCalloutOverlaps(project).length > 0);

  const arranged = arrangeProjectCallouts(project);

  assert.equal(arranged.overlaps.length, 0);
  assert.equal(findCalloutOverlaps(arranged.project).length, 0);
  assert.ok(new Set(arranged.project.locations.map((location) => `${location.callout.offsetX},${location.callout.offsetY}`)).size > 1);
});

test("automatic arrangement preserves locked manual callouts", () => {
  const project = createDefaultProject();
  const location = project.locations[0];
  location.callout.offsetX = 137;
  location.callout.offsetY = -83;
  location.callout.placementMode = "manual";
  location.callout.locked = true;

  const arranged = arrangeProjectCallouts(project);
  const restored = arranged.project.locations[0].callout;

  assert.equal(restored.offsetX, 137);
  assert.equal(restored.offsetY, -83);
  assert.equal(restored.placementMode, "manual");
  assert.equal(restored.locked, true);
});

test("leader lines begin outside the pin and support elbow routing", () => {
  const project = createDefaultProject();
  const callout = project.locations[0].callout;
  callout.offsetX = 120;
  callout.offsetY = 40;
  callout.leaderLine = "elbow";

  const connector = calloutConnector([300, 300], callout, measureCallout(callout), 12);

  assert.equal(connector.visible, true);
  assert.equal(connector.style, "elbow");
  assert.equal(connector.points.length, 3);
  assert.notDeepEqual(connector.points[0], [300, 300]);
});

test("enabling labels recovers a project where every location callout is hidden", () => {
  const project = createDefaultProject();
  project.map.showLocationLabels = false;
  project.locations.forEach((location) => {
    location.showLabel = false;
    location.callout.visible = false;
  });

  const enabled = enableProjectLocationLabels(project);

  assert.equal(enabled.revealedAll, true);
  assert.equal(enabled.project.map.showLocationLabels, true);
  assert.ok(enabled.project.locations.every((location) => location.showLabel && location.callout.visible));
  assert.ok(project.locations.every((location) => !location.showLabel && !location.callout.visible));
});

test("enabling labels preserves deliberate per-location hidden states", () => {
  const project = createDefaultProject();
  project.map.showLocationLabels = false;
  project.locations[0].callout.visible = true;
  project.locations[1].callout.visible = false;

  const enabled = enableProjectLocationLabels(project);

  assert.equal(enabled.revealedAll, false);
  assert.equal(enabled.project.map.showLocationLabels, true);
  assert.equal(enabled.project.locations[0].callout.visible, true);
  assert.equal(enabled.project.locations[1].callout.visible, false);
});

test("label display modes derive City, Company, layer, and selected-location views without mutating data", () => {
  const project = createDefaultProject();
  project.locations[0].callout.labels.push(createLocationLabel("company", "Example Company"));

  project.map.locationLabelMode = "city";
  const city = materializeLabelDisplay(project);
  assert.deepEqual(city.locations[0].callout.labels.map((label) => label.visible), [true, false]);

  project.map.locationLabelMode = "city-company";
  const company = materializeLabelDisplay(project);
  assert.deepEqual(company.locations[0].callout.labels.map((label) => label.visible), [true, true]);

  project.map.locationLabelMode = "selected-location";
  const selected = materializeLabelDisplay(project, { selectedLocationId: project.locations[1].id });
  assert.equal(selected.locations[0].callout.visible, false);
  assert.equal(selected.locations[1].callout.visible, true);
  assert.equal(project.locations[0].callout.labels[1].visible, true);
});

test("leader-line crossing detector flags intersecting callout routes", () => {
  const project = createDefaultProject();
  project.locations = [project.locations[0], project.locations[7]];
  const [first, second] = project.locations;
  first.callout = { ...first.callout, leaderLine: "straight", offsetX: 740, offsetY: 364, anchor: "start" };
  second.callout = { ...second.callout, leaderLine: "straight", offsetX: -804, offsetY: 201, anchor: "end" };

  assert.equal(findLeaderLineCrossings(project).length, 1);
});
