import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import license from "rollup-plugin-license";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

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
      ],
    },
  },
  plugins: [
    react(),
    TanStackRouterVite(),
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
});
