import { spawn } from "node:child_process";
import electron from "electron";

const smoke = process.argv.includes("--smoke");
const child = spawn(electron, ["."], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...(smoke ? { USA_MAP_STUDIO_SMOKE_TEST: "1" } : {}),
  },
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
