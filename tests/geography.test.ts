import assert from "node:assert/strict";
import test from "node:test";
import { feature } from "topojson-client";
import statesTopology from "../src/data/us-states-2025.topo.json";
import countiesTopology from "../src/data/us-counties-2025.topo.json";

test("bundled 2025 Census geography contains 50 states plus DC", () => {
  const topology = statesTopology as never;
  const collection = feature(topology, (statesTopology as { objects: { states: object } }).objects.states as never) as unknown as { features: unknown[] };
  assert.equal(collection.features.length, 51);
});

test("bundled county layer contains counties in the 50 states and DC", () => {
  const topology = countiesTopology as never;
  const collection = feature(topology, (countiesTopology as { objects: { counties: object } }).objects.counties as never) as unknown as { features: unknown[] };
  assert.equal(collection.features.length, 3_144);
});
