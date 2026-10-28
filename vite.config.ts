/// <reference types="vitest" />
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import license from "rollup-plugin-license";
import svgr from "vite-plugin-svgr";

// The vendored zstd decoder (src/api/worker/zstd/zstd-dec.wasm) is not an
// npm package, so add its BSD notice to the license report by hand
function zstdLicenseEntry() {
  const header = readFileSync("src/third_party/zstd/lib/zstd.h", "utf-8");
  const v = header.match(
    /ZSTD_VERSION_MAJOR\s+(\d+)\s+#define ZSTD_VERSION_MINOR\s+(\d+)\s+#define ZSTD_VERSION_RELEASE\s+(\d+)/,
  );
  if (!v) throw new Error("zstd.h: ZSTD_VERSION_* not found");
  const licenseText = readFileSync("src/third_party/zstd/LICENSE", "utf-8");
  return [
    "Name: zstd",
    `Version: ${v[1]}.${v[2]}.${v[3]}`,
    "License: BSD-3-Clause",
    "Private: false",
    "Description: Zstandard decompression library, compiled to WebAssembly",
    "Repository: https://github.com/facebook/zstd",
    "License Text:",
    "===",
    "",
    licenseText.trim(),
  ].join("\n");
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
              template: (dependencies) =>
                [...dependencies.map((d) => d.text()), zstdLicenseEntry()].join(
                  "\n\n---\n\n",
                ),
            },
          },
        }),
      ],
    },
  },
  plugins: [
    react(),
    svgr(),
    TanStackRouterVite(),

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
