/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import license from "rollup-plugin-license";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import svgr from "vite-plugin-svgr";
import { visualizer } from "rollup-plugin-visualizer";
import type { Plugin } from "vite";

// Drop index.html logo preloads belonging to the client not being built.
function stripOtherClientPreloads(): Plugin {
  const client = process.env.VITE_VALIDATOR_CLIENT?.trim();
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

// https://vitejs.dev/config/
export default defineConfig({
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
    plugins: () =>
      process.env.ANALYZE
        ? [
            visualizer({
              filename: "bundle-stats-worker.json",
              template: "raw-data",
              gzipSize: true,
              emitFile: false,
            }) as never,
          ]
        : [],
  },
  plugins: [
    stripOtherClientPreloads(),
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
});
