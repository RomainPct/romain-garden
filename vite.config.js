import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);

function resolveDsAssetsDir() {
  // Resolve via the package entry (exports map), then walk to dist/assets.
  const entry = require.resolve("@romainpct/romain-garden-ds");
  const assets = join(dirname(entry), "assets");
  if (existsSync(assets)) return assets;

  // Fallback for atypical installs.
  const fallback = resolve("node_modules/@romainpct/romain-garden-ds/dist/assets");
  if (existsSync(fallback)) return fallback;

  throw new Error(
    "Could not find @romainpct/romain-garden-ds assets. Is the package installed?",
  );
}

const dsAssets = resolveDsAssetsDir();
const dsRoot = dirname(dirname(dsAssets));

const MIME = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

/**
 * The DS resolves icons/fonts with `new URL("./assets/" + file, import.meta.url)`.
 * Vite cannot statically rewrite those dynamic URLs, so:
 * - in dev, serve files from the package's dist/assets
 * - in build, copy them next to the bundled JS (…/assets/assets/…)
 */
function romainGardenDsAssets() {
  return {
    name: "romain-garden-ds-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        const match = url.match(/\/assets\/([^/]+)$/);
        if (!match) {
          next();
          return;
        }

        const filePath = join(dsAssets, decodeURIComponent(match[1]));
        if (!existsSync(filePath)) {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader(
          "Content-Type",
          MIME[extname(filePath)] ?? "application/octet-stream",
        );
        res.end(readFileSync(filePath));
      });
    },
    closeBundle() {
      if (!existsSync(dsAssets)) return;

      // Bundled entry lives in dist/assets/*.js → ./assets/X resolves here.
      const outDir = resolve("dist/assets/assets");
      mkdirSync(outDir, { recursive: true });
      for (const file of readdirSync(dsAssets)) {
        cpSync(join(dsAssets, file), join(outDir, file));
      }
    },
  };
}

export default defineConfig({
  plugins: [romainGardenDsAssets()],
  optimizeDeps: {
    // Keep import.meta.url pointing at the real package module, not .vite/deps.
    exclude: ["@romainpct/romain-garden-ds"],
  },
  server: {
    port: 5173,
    fs: {
      allow: [resolve("."), dsRoot],
    },
  },
});
