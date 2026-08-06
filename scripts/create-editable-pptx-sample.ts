import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDefaultProject } from "../src/data/default-project";
import { projectToPowerPoint } from "../src/lib/export";

const project = createDefaultProject();
project.project.name = "Editable USA map example";
project.map.title = "Editable USA map example";
project.map.subtitle = "Every state, label, pin, and legend element can be selected independently";
project.map.showStateLabels = true;
project.map.stateColors = {
  "06": "#00b38f",
  "47": "#fe5000",
  "48": "#006ba6",
};

const outputPath = resolve("examples/usa-map-studio-editable-export.pptx");
const bytes = await projectToPowerPoint(project);
await writeFile(outputPath, new Uint8Array(bytes));
console.log(`Created ${outputPath}`);
