import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDefaultProject } from "../src/data/default-project";
import { projectToPowerPoint } from "../src/lib/export";
import { arrangeProjectCallouts, createLocationLabel } from "../src/lib/callouts";

const project = createDefaultProject();
project.project.name = "Editable USA map example";
project.map.title = "Editable USA map example";
project.map.subtitle = "Editable City and Company labels, leader lines, pins, and layer-prefixed Selection Pane names";
project.layers[0].name = "Layer #1 - US ITER cities";
project.layers[0].description = "Example primary contract layer";
project.layers.push({
  id: "layer-io-example",
  name: "Layer #2 - IO cities",
  description: "Example international organization contract layer",
  visible: true,
  createdAt: project.project.createdAt,
});
project.locations.slice(4).forEach((location) => { location.layerId = "layer-io-example"; });
project.sharedPinStyle = {
  enabled: true,
  pinType: "circle",
  customPinId: null,
  pinColor: "#00662c",
  pinSize: 16,
};
project.map.showStateLabels = true;
project.map.stateColors = {
  "06": "#00b38f",
  "47": "#fe5000",
  "48": "#006ba6",
};
project.locations.forEach((location, index) => {
  location.callout.labels.push(createLocationLabel("company", `Example partner ${index + 1}`, {
    fontFamily: "Arial",
    fontSize: 9,
    fontWeight: 600,
    color: "#00454d",
  }));
});
project.locations[6].callout.leaderLine = "elbow";

const outputPath = resolve("examples/usa-map-studio-editable-export.pptx");
const bytes = await projectToPowerPoint(arrangeProjectCallouts(project).project);
await writeFile(outputPath, new Uint8Array(bytes));
console.log(`Created ${outputPath}`);
