import { geoAlbersUsa, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { feature, mesh } from "topojson-client";
import countiesTopologyData from "../data/us-counties-2025.topo.json";
import statesTopologyData from "../data/us-states-2025.topo.json";

export interface StateProperties {
  STATEFP: string;
  STUSPS: string;
  NAME: string;
}

const statesTopology = statesTopologyData as unknown as {
  type: "Topology";
  objects: { states: object };
  arcs: unknown[];
};

const countiesTopology = countiesTopologyData as unknown as {
  type: "Topology";
  objects: { counties: object };
  arcs: unknown[];
};

export const states = feature(
  statesTopology as never,
  statesTopology.objects.states as never,
) as unknown as FeatureCollection<Geometry, StateProperties>;

export const stateBoundaries = mesh(
  statesTopology as never,
  statesTopology.objects.states as never,
  (left, right) => left !== right,
);

export const countyBoundaries = mesh(
  countiesTopology as never,
  countiesTopology.objects.counties as never,
  (left, right) => left !== right,
);

export const projection = geoAlbersUsa().fitExtent([[54, 104], [1146, 676]], states);
export const mapPath = geoPath(projection);
