import assert from "node:assert/strict";
import test from "node:test";
import { ORNL_SWATCH_GROUPS } from "../src/data/ornl-palette";

test("ORNL swatches expose the complete approved primary, secondary, and accent palette", () => {
  assert.deepEqual(ORNL_SWATCH_GROUPS.map((group) => group.name), ["Primary", "Secondary", "Accent"]);
  assert.equal(ORNL_SWATCH_GROUPS.flatMap((group) => group.colors).length, 15);
  assert.deepEqual(
    Object.fromEntries(ORNL_SWATCH_GROUPS.flatMap((group) => group.colors).map((color) => [color.name, color.value])),
    {
      "ORNL Green": "#00662c",
      "Hale Navy": "#00454d",
      Graphite: "#dbdcdb",
      Polar: "#ffffff",
      "Dark Matter": "#373a36",
      Energy: "#7dba00",
      Mist: "#8bfebf",
      Biome: "#00b38f",
      Aqua: "#00bdb5",
      Infinity: "#006ba6",
      Hydro: "#005776",
      Forge: "#ff9e1b",
      Spark: "#fe5000",
      Plasma: "#b50094",
      Pulsar: "#4e008e",
    },
  );
});
