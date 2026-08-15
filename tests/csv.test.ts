import assert from "node:assert/strict";
import test from "node:test";
import { getCsvHeaders, parseLocationsCsv, suggestCsvColumnMap } from "../src/lib/csv";
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

test("CSV import creates independently styled City, Company, and extra label rows", () => {
  const result = parseLocationsCsv("city,state,company,label,label_2\nOak Ridge,TN,Example Manufacturing,Oak Ridge,DOE supplier\n");
  const location = result.locations[0];
  assert.deepEqual(location.callout.labels.map((label) => label.role), ["city", "company", "custom"]);
  assert.deepEqual(location.callout.labels.map((label) => label.text), ["Oak Ridge", "Example Manufacturing", "DOE supplier"]);
  assert.equal(location.customData.company, "Example Manufacturing");
  assert.equal(location.customData.label_2, undefined);
});

test("CSV import reports unresolved places without dropping valid rows", () => {
  const result = parseLocationsCsv("city,state\nNot A Real Place,TN\nAtlanta,GA\n");
  assert.equal(result.locations.length, 1);
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0].reason, /offline Census place match/i);
});

test("CSV column mapping resolves unfamiliar client headings", () => {
  const csv = "Town supplied by client,Region code,Vendor organization\nOak Ridge,TN,Example Manufacturing";
  const headers = getCsvHeaders(csv);
  const suggested = suggestCsvColumnMap(headers);
  const result = parseLocationsCsv(csv, {
    columnMap: {
      ...suggested,
      city: "Town supplied by client",
      state: "Region code",
      company: "Vendor organization",
    },
  });

  assert.equal(result.locations.length, 1);
  assert.equal(result.locations[0].city, "Oak Ridge");
  assert.equal(result.locations[0].callout.labels.find((label) => label.role === "company")?.text, "Example Manufacturing");
});
