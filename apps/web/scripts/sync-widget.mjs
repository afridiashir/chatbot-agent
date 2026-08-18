/**
 * Copies the built chat widget into this app's `public/` so the site serves it
 * from its own origin.
 *
 * The widget is a separate build (Vite), and Turborepo builds it first via the
 * `@repo/widget` dependency. Copying rather than pointing a script tag at the
 * widget's dev server keeps the embed identical in development and production —
 * and the Vite dev server cannot serve this bundle to a page it did not render,
 * because React Fast Refresh needs a preamble only Vite's own HTML carries.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../widget/dist/widget.js");
const target = resolve(here, "../public/widget.js");

if (!existsSync(source)) {
  console.error(
    `[sync-widget] ${source} is missing. Build it first: pnpm --filter @repo/widget build`,
  );
  process.exit(1);
}

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log("[sync-widget] public/widget.js updated");
