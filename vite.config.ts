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
// In build, where the hashed wsWorker asset name is known, the inline
// script also boots the real wsWorker and wires the blob-worker adoption
// (the same MessageChannel + "adopt" contract as earlyWs.ts) immediately,
// so decode+parse completes while the main bundle is still fetching; the
// worker handle plus its pre-attach messages park on window.__fdWsMain
// for useWsWorker to attach to. Dev has no hashed names, so it keeps the
// blob-only path with main-bundle adoption. Any failure falls back one
// step: inline wsWorker spawn failure leaves window.__fdWsEarly for the
// bundle to adopt; blob failure has the worker connect on its own.
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
        const wsWorkerFile = ctx.bundle
          ? Object.keys(ctx.bundle).find((f) =>
              /^assets\/wsWorker-[\w-]+\.js$/.test(f),
            )
          : undefined;
        // port1 to the blob worker last: it is the commit point that
        // switches the blob worker into port mode, so any earlier throw
        // leaves __fdWsEarly adoptable by the bundle as before
        const spawnMain = wsWorkerFile
          ? "try{" +
            `var mw=new Worker(${JSON.stringify("/" + wsWorkerFile)});` +
            "try{" +
            "var c=new MessageChannel();" +
            `mw.postMessage({type:"adopt",websocketUrl:u,compress:${compress},port:c.port2},[c.port2]);` +
            "w.postMessage(c.port1,[c.port1]);" +
            `var g={worker:mw,early:w,url:u,compress:${compress},error:false,pending:[]};` +
            // buffer the events, not data: clones deserialize lazily on
            // first data access, so big batches don't stall attach
            "mw.onmessage=function(m){if(g.pending.length<1e4)g.pending.push(m)};" +
            "mw.onerror=function(){g.error=true};" +
            "window.__fdWsMain=g;" +
            "delete window.__fdWsEarly" +
            "}catch(x){mw.terminate()}" +
            "}catch(x){}"
          : "";
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
                "window.__fdWsEarly=e;" +
                spawnMain +
                "}catch(x){}})();",
            },
          ],
        };
      },
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
    resolve: {
      // lodash/foo -> lodash-es/foo: same 4.17.21 sources as ESM, so the
      // bundle tree-shakes to the functions actually used
      alias: [{ find: "lodash", replacement: "lodash-es" }],
    },
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
      earlyWebsocket(client, devWsUrl, wsCompress),
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
