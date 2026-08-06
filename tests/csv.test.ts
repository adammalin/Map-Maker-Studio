import assert from "node:assert/strict";
import test from "node:test";
import { parseLocationsCsv } from "../src/lib/csv";
import { placeCount, resolveCity } from "../src/lib/geocoder";

test("bundled Census place index contains the full national places file", () => {
  assert.equal(placeCount(), 32_350);
  const oakRidge = resolveCity("Oak Ridge", "Tennessee");
  assert.ok(oakRidge);
  assert.equal(oakRidge.state, "TN");
  assert.ok(oakRidge.latitude > 35 && oakRidge.latitude < 37);
  assert.ok(oakRidge.longitude < -83 && oakRidge.longitude > -86);
});

test("CSV import resolves city and state rows offline", () => {
  const result = parseLocationsCsv(
    "City,State,Label,Pin Color\nOak Ridge,TN,Lab,#00662c\nSeattle,WA,Northwest,#006ba6\n",
    { layerId: "layer-io" },
  );
  assert.equal(result.locations.length, 2);
  assert.equal(result.issues.length, 0);
  assert.equal(result.locations[0].label, "Lab");
  assert.equal(result.locations[1].pinColor, "#006ba6");
  assert.equal(result.locations[0].layerId, "layer-io");
});

test("CSV import preserves coordinates and custom columns", () => {
  const result = parseLocationsCsv("city,state,lat,lng,pin_type,visible,show_label,owner\nDenver,CO,39.7392,-104.9903,diamond,no,no,Central team\n");
  assert.equal(result.locations[0].pinType, "diamond");
  assert.equal(result.locations[0].showLabel, false);
  assert.equal(result.locations[0].visible, false);
  assert.equal(result.locations[0].customData.owner, "Central team");
  assert.equal(result.locations[0].latitude, 39.7392);
});

test("CSV import reports unresolved places without dropping valid rows", () => {
  const result = parseLocationsCsv("city,state\nNot A Real Place,TN\nAtlanta,GA\n");
  assert.equal(result.locations.length, 1);
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0].reason, /offline Census place match/i);
});
