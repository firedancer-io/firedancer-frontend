/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import license from "rollup-plugin-license";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import svgr from "vite-plugin-svgr";
import { visualizer } from "rollup-plugin-visualizer";
import type { Plugin } from "vite";
import { createHash } from "node:crypto";

// Drop index.html logo preloads belonging to the client not being built.
function stripOtherClientPreloads(client: string | undefined): Plugin {
  const strip =
    client === "Firedancer"
      ? "frankendancer"
      : client === "Frankendancer"
        ? "firedancer"
        : undefined;
  return {
    name: "strip-other-client-preloads",
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        strip
          ? html.replace(
              new RegExp(
                `<link[^>]*href="[^"]*assets/${strip}[^>]*/>\\s*`,
                "g",
              ),
              "",
            )
          : html,
    },
  };
}

// Drop the index.html static splash unless building Firedancer (the
// React splash that adopts it is Firedancer-only).
function stripStaticSplash(client: string | undefined): Plugin {
  const keep = client === "Firedancer";
  return {
    name: "strip-static-splash",
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        keep
          ? html
          : html.replace(
              /[ \t]*<!-- fd-splash-start -->[\s\S]*?<!-- fd-splash-end -->\n/g,
              "",
            ),
    },
  };
}

// Extract the zstd wasm that @oneidentity/zstd-js inlines as a base64 data
// URI into a binary asset fetched in parallel with worker startup.  The
// package's ZstdInit calls its emscripten factory with no Module argument,
// so wasmBinary/locateFile cannot be injected; instead swap the data URI
// for a bare hashed filename, which emscripten resolves against the worker
// script's own directory (both land in assets/) and fetches.  ZstdInit
// still rejects on fetch/instantiate failure, preserving the uncompressed
// fallback.
function zstdWasmAsset(): Plugin {
  return {
    name: "zstd-wasm-asset",
    apply: "build",
    transform(code, id) {
      if (!id.replace(/\?.*$/, "").endsWith("zstd-js/decompress/index.js"))
        return;

      // AGFzbQ is base64 "\0asm"
      const match = code.match(
        /"data:application\/octet-stream;base64,(AGFzbQ[A-Za-z0-9+/=]+)"/,
      );
      if (!match) {
        this.warn("zstd wasm data URI not found; leaving base64 inline");
        return;
      }

      const wasm = Buffer.from(match[1], "base64");
      const hash = createHash("sha256").update(wasm).digest("hex").slice(0, 8);
      const fileName = `zstd-dec-${hash}.wasm`;
      this.emitFile({
        type: "asset",
        fileName: `assets/${fileName}`,
        source: wasm,
      });
      return {
        code: code.replace(match[0], JSON.stringify(fileName)),
        map: null,
      };
    },
  };
}

// https://vitejs.dev/config/
// Function form: the client must come from loadEnv, not process.env --
// `make frontend` selects it via .env.production, which is invisible to
// process.env at config time.
export default defineConfig(({ mode }) => {
  const client = (
    process.env.VITE_VALIDATOR_CLIENT ??
    loadEnv(mode, process.cwd(), "").VITE_VALIDATOR_CLIENT
  )?.trim();
  return {
    server: {
      host: "0.0.0.0",
      // port: 5301
      // https: true,
    },
    preview: {
      port: 5173,
    },
    css: {
      modules: {
        localsConvention: "camelCaseOnly",
      },
    },
    build: {
      minify: "esbuild",
      rollupOptions: {
        plugins: [
          license({
            thirdParty: {
              output: {
                file: "dist/LICENSE_DEPENDENCIES",
              },
            },
          }),
          ...(process.env.ANALYZE
            ? [
                visualizer({
                  filename: "bundle-stats.json",
                  template: "raw-data",
                  gzipSize: true,
                }),
              ]
            : []),
        ],
      },
    },
    worker: {
      plugins: () => [
        zstdWasmAsset(),
        ...(process.env.ANALYZE
          ? [
              visualizer({
                filename: "bundle-stats-worker.json",
                template: "raw-data",
                gzipSize: true,
                emitFile: false,
              }) as never,
            ]
          : []),
      ],
    },
    plugins: [
      stripOtherClientPreloads(client),
      stripStaticSplash(client),
      react(),
      svgr(),
      TanStackRouterVite({ quoteStyle: "double", semicolons: true }),
      wasm(),
      topLevelAwait(),

      checker({
        typescript: true,
      }),
      checker({
        eslint: {
          lintCommand: 'eslint "./src/**/*.{ts,tsx}"',
          useFlatConfig: true,
        },
        overlay: false,
      }),
    ],
    test: {
      environment: "jsdom",
      env: {
        TZ: "America/Chicago",
      },
    },
  };
});
