import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultProject } from "../src/data/default-project";
import { buildMcpProposal } from "../src/lib/mcp-proposals";

test("MCP location changes stage a proposal without mutating the working project", () => {
  const current = createDefaultProject();
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
