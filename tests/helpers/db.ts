import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

export function resetDatabase() {
  execFileSync(npxCommand, ["prisma", "migrate", "reset", "--force"], {
    cwd: workspaceRoot,
    stdio: "pipe",
  });

  execFileSync(npmCommand, ["run", "db:seed"], {
    cwd: workspaceRoot,
    stdio: "pipe",
  });
}
