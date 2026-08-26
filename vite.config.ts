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
import { earlyWsWorkerMain } from "./src/api/worker/earlyWsWorker";

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

// Open the WebSocket from a tiny dedicated worker spawned off a Blob URL
// by an inline script, so the handshake and first frames overlap main
// bundle fetch/eval AND frame consumption happens on an idle thread (a
// blocked main thread would stall Chrome's websocket flow control).
// useWsWorker adopts the socket at startup by wiring a MessageChannel
// between the blob worker and wsWorker (earlyWs.ts); any failure falls
// back to the worker opening its own connection as before.
// Firedancer-only. URL and subprotocol offer mirror src/api/consts.ts:
// same-origin ws(s)://host:port/websocket in production,
// VITE_WEBSOCKET_URL when serving dev.
function earlyWebsocket(
  client: string | undefined,
  devWsUrl: string | undefined,
  compress: boolean,
): Plugin {
  // worker body shared with the earlyWs tests; stringified into the page
  const workerFn = JSON.stringify(earlyWsWorkerMain.toString());
  return {
    name: "early-websocket",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (client !== "Firedancer") return html;
        const urlExpr =
          ctx.server && devWsUrl
            ? JSON.stringify(devWsUrl)
            : '(window.location.protocol.startsWith("https")?"wss":"ws")+"://"+window.location.hostname+":"+window.location.port+"/websocket"';
        return {
          html,
          tags: [
            {
              tag: "script",
              injectTo: "head-prepend",
              children:
                "(function(){try{" +
                `var u=${urlExpr};` +
                `var s="("+${workerFn}+")(self,WebSocket,"+JSON.stringify(u)+",${compress});";` +
                'var r=URL.createObjectURL(new Blob([s],{type:"text/javascript"}));' +
                "var w=new Worker(r);" +
                "URL.revokeObjectURL(r);" +
                `var e={worker:w,url:u,compress:${compress},error:false,closed:false};` +
                "w.onmessage=function(m){if(m.data==='error')e.error=true;else if(m.data==='closed')e.closed=true};" +
                "w.onerror=function(){e.error=true};" +
                "window.__fdWsEarly=e" +
                "}catch(x){}})();",
            },
          ],
        };
      },
    },
  };
}

// Swap the render-blocking main stylesheet for a preloaded async one so
// first paint is the inline-styled static splash.  Firedancer-only: the
// opaque static splash covers the app until Logo removes it, and Logo
// gates that removal on this link having applied (via data-main-css).
// noscript keeps a render-blocking fallback.
function asyncMainStylesheet(client: string | undefined): Plugin {
  return {
    name: "async-main-stylesheet",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (html) =>
        client === "Firedancer"
          ? html.replace(
              /<link rel="stylesheet"([^>]*)>/g,
              '<link rel="preload" as="style" data-main-css$1 onload="this.onload=null;this.rel=\'stylesheet\'"><noscript><link rel="stylesheet"$1></noscript>',
            )
          : html,
    },
  };
}

// https://vitejs.dev/config/
// Function form: the client must come from loadEnv, not process.env --
// `make frontend` selects it via .env.production, which is invisible to
// process.env at config time.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const client = (
    process.env.VITE_VALIDATOR_CLIENT ?? env.VITE_VALIDATOR_CLIENT
  )?.trim();
  const devWsUrl = (
    process.env.VITE_WEBSOCKET_URL ?? env.VITE_WEBSOCKET_URL
  )?.trim();
  const wsCompress =
    (
      process.env.VITE_WEBSOCKET_COMPRESS ?? env.VITE_WEBSOCKET_COMPRESS
    )?.trim() !== "false";
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
      earlyWebsocket(client, devWsUrl, wsCompress),
      asyncMainStylesheet(client),
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
