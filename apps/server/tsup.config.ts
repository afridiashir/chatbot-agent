import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: true,
  // Workspace packages ship raw TypeScript, so they must be bundled in.
  noExternal: [/^@repo\//],
  // Bundling @repo/db pulls in CommonJS dependencies (pg) that call require()
  // for Node built-ins, which an ESM bundle doesn't have. Give it one.
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});
