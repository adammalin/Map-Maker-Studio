import tokens from "./ornl-design-tokens.json";

export interface BrandSwatch {
  name: string;
  value: string;
}

export interface BrandSwatchGroup {
  name: string;
  colors: BrandSwatch[];
}

export const ORNL_SWATCH_GROUPS: BrandSwatchGroup[] = [
  {
    name: "Primary",
    colors: [
      { name: "ORNL Green", value: tokens.color.primary["ornl-green"].$value },
      { name: "Hale Navy", value: tokens.color.primary["hale-navy"].$value },
      { name: "Graphite", value: tokens.color.primary.graphite.$value },
      { name: "Polar", value: tokens.color.primary.polar.$value },
      { name: "Dark Matter", value: tokens.color.primary["dark-matter"].$value },
    ],
  },
  {
    name: "Secondary",
    colors: [
      { name: "Energy", value: tokens.color.secondary.energy.$value },
      { name: "Mist", value: tokens.color.secondary.mist.$value },
      { name: "Biome", value: tokens.color.secondary.biome.$value },
      { name: "Aqua", value: tokens.color.secondary.aqua.$value },
      { name: "Infinity", value: tokens.color.secondary.infinity.$value },
      { name: "Hydro", value: tokens.color.secondary.hydro.$value },
    ],
  },
  {
    name: "Accent",
    colors: [
      { name: "Forge", value: tokens.color.accent.forge.$value },
      { name: "Spark", value: tokens.color.accent.spark.$value },
      { name: "Plasma", value: tokens.color.accent.plasma.$value },
      { name: "Pulsar", value: tokens.color.accent.pulsar.$value },
    ],
  },
].map((group) => ({
  ...group,
  colors: group.colors.map((color) => ({ ...color, value: color.value.toLowerCase() })),
}));
