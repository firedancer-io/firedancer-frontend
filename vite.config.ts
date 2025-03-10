import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import license from "rollup-plugin-license";
import { buffer } from "stream/consumers";

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
    assetsInlineLimit: (filePath: string, content: Buffer) => {
      if (filePath.endsWith(".wasm")) return true;
      if (content.byteLength <= 4096) return true;
      return false;
    },
  },
  plugins: [
    react(),
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
});
