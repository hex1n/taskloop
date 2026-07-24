import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tickets = [2, 3, 4, 5, 6, 7, 8, 9, 10].map((number) =>
  path.join("tests", "acceptance", "provider", `ticket${String(number).padStart(2, "0")}.mjs`),
);
for (const ticket of tickets) {
  const result = spawnSync(process.execPath, [ticket], { cwd: root, encoding: "utf8", timeout: 180_000 });
  process.stdout.write(String(result.stdout ?? ""));
  process.stderr.write(String(result.stderr ?? ""));
  if (result.error || result.status !== 4) {
    process.stderr.write(`provider ticket acceptance failed: ${ticket}\n`);
    process.exit(1);
  }
}
