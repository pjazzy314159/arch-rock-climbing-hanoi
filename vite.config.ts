// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import fs from "node:fs";

// The repository can be reached through a directory symlink (for example
// `C:\Users\<user>\MattNg\LAB` -> `F:\LAB`). Vite resolves symlinked imports to
// their real path, which then sits outside the detected project root and is
// served as `/@fs/<real drive>/…`. Without allowing that path explicitly the
// dev server answers 404 for local assets such as the hero photographs.
const realProjectRoot = fs.realpathSync(__dirname);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Anchor the project at its real path so that resolved module ids (and the
    // asset URLs generated from them) stay inside the project root.
    root: realProjectRoot,
    server: {
      fs: {
        // The project may sit behind a directory symlink; Vite resolves assets
        // to their real path, which can fall outside the detected root.
        strict: false,
        allow: [realProjectRoot, __dirname],
      },
      watch: {
        // The Python backend has its own toolchain; watching its virtual
        // environment only causes pointless reloads.
        ignored: ["**/backend/.venv/**", "**/backend/var/**", "**/var/**"],
      },
    },
  },
});
