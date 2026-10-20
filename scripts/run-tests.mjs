/**
 * Vitest launcher that normalises the working directory to the real path of
 * the repository.
 *
 * The project can be reached through a directory symlink (for example
 * `C:\Users\<user>\MattNg\LAB` -> `F:\LAB`). Vite resolves symlinks to their
 * real path, so with a symlinked working directory the test setup file ends up
 * outside the Vite root, is externalised, and fails to load with
 * `Cannot find module '/@fs/<drive>/...'`. Running Vitest from the real path
 * avoids that entirely and does not change what is being tested.
 *
 * Usage: node scripts/run-tests.mjs [--watch] [extra vitest args]
 */
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const realRoot = realpathSync(repoRoot);
const vitestBin = path.join(realRoot, "node_modules", "vitest", "vitest.mjs");

const child = spawn(process.execPath, [vitestBin, ...process.argv.slice(2)], {
  cwd: realRoot,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
