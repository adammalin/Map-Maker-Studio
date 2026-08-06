import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultProject } from "../src/data/default-project";
import { buildMcpProposal } from "../src/lib/mcp-proposals";

test("MCP location changes stage a proposal without mutating the working project", () => {
  const current = createDefaultProject();
  current.sharedPinStyle.enabled = false;
  const originalLabel = current.locations[0].label;
  const result = buildMcpProposal("stage_location_update", {
    locationId: current.locations[0].id,
    patch: { label: "Proposed label", pinColor: "#ff9e1b" },
    expectedUpdatedAt: current.project.updatedAt,
    summary: "Refresh the first pin",
  }, current);

  assert.equal(current.locations[0].label, originalLabel);
  assert.equal(result.proposal.current.locations[0].label, originalLabel);
  assert.equal(result.proposal.proposed.locations[0].label, "Proposed label");
  assert.equal(result.proposal.proposed.locations[0].pinColor, "#ff9e1b");
  assert.equal(result.proposal.baseUpdatedAt, current.project.updatedAt);
});

test("MCP can stage independent location visibility without deleting the city", () => {
  const current = createDefaultProject();
  const result = buildMcpProposal("stage_location_update", {
    locationId: current.locations[0].id,
    patch: { visible: false },
    expectedUpdatedAt: current.project.updatedAt,
    summary: "Hide Seattle without deleting it",
  }, current);
  assert.equal(current.locations[0].visible, true);
  assert.equal(result.proposal.proposed.locations[0].visible, false);
  assert.equal(result.proposal.proposed.locations.length, current.locations.length);
});

test("MCP proposal creation rejects a stale project timestamp", () => {
  const current = createDefaultProject();
  assert.throws(() => buildMcpProposal("stage_map_style_update", {
    patch: { showCountyLines: true },
    expectedUpdatedAt: "stale-timestamp",
    summary: "Show county lines",
  }, current), /changed after it was read/i);
});

test("MCP CSV staging uses the offline resolver and reports excluded rows", () => {
  const current = createDefaultProject();
  const result = buildMcpProposal("stage_locations_from_csv", {
    csv: "city,state,label\nOak Ridge,TN,Lab\nNot A Place,TN,Bad\n",
    mode: "replace",
    expectedUpdatedAt: current.project.updatedAt,
    summary: "Replace with the approved CSV list",
  }, current);

  assert.equal(result.proposal.proposed.locations.length, 1);
  assert.equal(result.proposal.proposed.locations[0].label, "Lab");
  assert.equal(result.importIssues?.length, 1);
  assert.equal(current.locations.length, 8);
});

test("complete project proposals preserve stable identity and creation date", () => {
  const current = createDefaultProject();
  const candidate = structuredClone(current);
  candidate.project.id = "ai-invented-id";
  candidate.project.createdAt = "2001-01-01T00:00:00.000Z";
  candidate.project.name = "Proposed national map";
  candidate.locations = candidate.locations.slice(0, 2);
  const result = buildMcpProposal("replace_project_draft", {
    project: candidate,
    expectedUpdatedAt: current.project.updatedAt,
    summary: "Reduce the project to two locations",
  }, current);

  assert.equal(result.proposal.proposed.project.id, current.project.id);
  assert.equal(result.proposal.proposed.project.createdAt, current.project.createdAt);
  assert.equal(result.proposal.proposed.project.name, "Proposed national map");
  assert.equal(result.proposal.proposed.locations.length, 2);
});

test("MCP removal proposals preserve the working list until review", () => {
  const current = createDefaultProject();
  const removedId = current.locations[0].id;
  const result = buildMcpProposal("stage_locations_remove", {
    locationIds: [removedId],
    expectedUpdatedAt: current.project.updatedAt,
    summary: "Remove the first location",
  }, current);
  assert.equal(current.locations.length, 8);
  assert.equal(result.proposal.proposed.locations.length, 7);
  assert.equal(result.proposal.proposed.locations.some((location) => location.id === removedId), false);
});

test("MCP custom SVG import stages a sanitized embedded design", () => {
  const current = createDefaultProject();
  current.sharedPinStyle.enabled = false;
  const result = buildMcpProposal("stage_custom_pin_import", {
    name: "AI marker",
    svg: '<svg viewBox="0 0 20 20" onload="bad()"><circle cx="10" cy="10" r="9" fill="currentColor"/></svg>',
    assignLocationId: current.locations[0].id,
    expectedUpdatedAt: current.project.updatedAt,
    summary: "Add the approved custom marker",
  }, current);
  assert.equal(current.customPins.length, 0);
  assert.equal(result.proposal.proposed.customPins.length, 1);
  assert.doesNotMatch(result.proposal.proposed.customPins[0].svg, /onload/i);
  assert.equal(
    result.proposal.proposed.locations[0].customPinId,
    result.proposal.proposed.customPins[0].id,
  );
  assert.equal(result.removedSvgItems, 1);
});

test("MCP custom SVG import can assign the design to every location", () => {
  const current = createDefaultProject();
  const result = buildMcpProposal("stage_custom_pin_import", {
    name: "National marker",
    svg: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="currentColor"/></svg>',
    assignToAll: true,
    expectedUpdatedAt: current.project.updatedAt,
    summary: "Use the approved marker everywhere",
  }, current);
  const designId = result.proposal.proposed.customPins[0].id;
  assert.equal(result.proposal.proposed.locations.length, current.locations.length);
  assert.ok(result.proposal.proposed.locations.every((location) => location.customPinId === designId));
  assert.ok(current.locations.every((location) => location.customPinId === null));
  assert.equal(result.proposal.proposed.sharedPinStyle.enabled, true);
  assert.equal(result.proposal.proposed.sharedPinStyle.customPinId, designId);
});

test("MCP layer proposals create, rename, toggle, and assign without mutating the working project", () => {
  const current = createDefaultProject();
  const created = buildMcpProposal("stage_layer_create", {
    name: "Layer #2 - IO cities",
    description: "ITER Organization contracts",
    expectedUpdatedAt: current.project.updatedAt,
    summary: "Create the IO layer",
  }, current).proposal.proposed;
  assert.equal(current.layers.length, 1);
  assert.equal(created.layers.length, 2);
  const ioLayer = created.layers[1];

  const renamed = buildMcpProposal("stage_layer_update", {
    layerId: ioLayer.id,
    patch: { name: "IO cities", visible: false },
    expectedUpdatedAt: created.project.updatedAt,
    summary: "Rename and hide the IO layer",
  }, created).proposal.proposed;
  assert.equal(renamed.layers[1].name, "IO cities");
  assert.equal(renamed.layers[1].visible, false);

  const assigned = buildMcpProposal("stage_locations_assign_layer", {
    layerId: ioLayer.id,
    locationIds: [renamed.locations[0].id, renamed.locations[1].id],
    expectedUpdatedAt: renamed.project.updatedAt,
    summary: "Assign two IO locations",
  }, renamed).proposal.proposed;
  assert.equal(assigned.locations.filter((location) => location.layerId === ioLayer.id).length, 2);
});

test("MCP CSV import can replace only its target layer", () => {
  const current = createDefaultProject();
  current.layers.push({ id: "layer-io", name: "IO cities", description: "", visible: true, createdAt: new Date().toISOString() });
  current.locations[0].layerId = "layer-io";
  const result = buildMcpProposal("stage_locations_from_csv", {
    csv: "city,state\nOak Ridge,TN\n",
    mode: "replace_layer",
    layerId: "layer-io",
    expectedUpdatedAt: current.project.updatedAt,
    summary: "Replace the IO city list",
  }, current);
  assert.equal(result.proposal.proposed.locations.length, 8);
  assert.equal(result.proposal.proposed.locations.filter((location) => location.layerId === "layer-io").length, 1);
});

test("MCP shared pin style guarantees one effective style across layers", () => {
  const current = createDefaultProject();
  const result = buildMcpProposal("stage_shared_pin_style_update", {
    patch: { enabled: true, pinType: "circle", pinColor: "#ffb000", pinSize: 14 },
    expectedUpdatedAt: current.project.updatedAt,
    summary: "Use one yellow dot everywhere",
  }, current);
  assert.deepEqual(result.proposal.proposed.sharedPinStyle, {
    enabled: true,
    pinType: "circle",
    customPinId: null,
    pinColor: "#ffb000",
    pinSize: 14,
  });
  assert.ok(result.proposal.proposed.locations.every((location) => location.pinSize === 14));
  assert.ok(result.proposal.proposed.locations.every((location) => location.pinColor === "#ffb000"));
});
