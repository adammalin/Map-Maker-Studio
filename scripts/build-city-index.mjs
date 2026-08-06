import fs from "node:fs/promises";
import path from "node:path";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/build-city-index.mjs <gazetteer.txt> <output.json>");
  process.exit(1);
}

const text = await fs.readFile(inputPath, "utf8");
const [headerLine, ...lines] = text.trim().split(/\r?\n/);
const headers = headerLine.split("|").map((header) => header.trim());
const column = Object.fromEntries(headers.map((header, index) => [header, index]));
const stripSuffix = (name) => name
  .replace(/\s+(city and borough|consolidated government|unified government|municipality|metropolitan government|urban county|balance|city|town|village|borough|CDP)$/i, "")
  .trim();

const places = lines.flatMap((line) => {
  const cells = line.split("|").map((cell) => cell.trim());
  const latitude = Number(cells[column.INTPTLAT]);
  const longitude = Number(cells[column.INTPTLONG]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
  const fullName = cells[column.NAME];
  return [{
    city: stripSuffix(fullName),
    fullName,
    state: cells[column.USPS],
    latitude,
    longitude,
    geoid: cells[column.GEOID],
  }];
});

places.sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city));
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(places)}\n`);
console.log(`Wrote ${places.length.toLocaleString()} places to ${outputPath}`);
