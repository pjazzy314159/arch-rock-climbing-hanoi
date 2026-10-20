/**
 * Remove the build output directories before a production build.
 *
 * The Nitro/Cloudflare output is not fully emptied between builds, so a
 * rebuild can leave a server bundle that references an asset hash which is no
 * longer in `.output/public`. The result is a site that builds successfully
 * but renders without its stylesheet. Cleaning first makes every build
 * self-contained and repeatable.
 *
 * Usage: node scripts/clean-output.mjs
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

for (const directory of [".output", "dist", ".nitro", ".tanstack"]) {
  const target = path.join(repoRoot, directory);
  await rm(target, { recursive: true, force: true });
  console.log(`removed ${directory}/`);
}
