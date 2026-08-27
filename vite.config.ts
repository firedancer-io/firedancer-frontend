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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
// The package's wasm fetch sites are additionally rewired to consume the
// worker's top-level prefetch (zstdWasmPrefetch.ts, whose placeholder is
// filled in here), so the download runs while the worker bundle is still
// evaluating and ZstdInit starts at streaming compile.
function zstdWasmAsset(): Plugin {
  // AGFzbQ is base64 "\0asm"
  const dataUriRe =
    /"data:application\/octet-stream;base64,(AGFzbQ[A-Za-z0-9+/=]+)"/;
  const nameOf = (wasm: Buffer) =>
    `zstd-dec-${createHash("sha256").update(wasm).digest("hex").slice(0, 8)}.wasm`;
  return {
    name: "zstd-wasm-asset",
    apply: "build",
    transform(code, id) {
      const file = id.replace(/\?.*$/, "");

      if (file.endsWith("src/api/worker/zstdWasmPrefetch.ts")) {
        // the sole live consumer of the wasm (zstdDecompress.ts): emit
        // the asset here, since the package module only stays in the
        // graph as an eliminated dev-fallback branch
        const match = readFileSync(
          fileURLToPath(
            new URL(
              "./node_modules/@oneidentity/zstd-js/decompress/index.js",
              import.meta.url,
            ),
          ),
          "utf8",
        ).match(dataUriRe);
        if (!match) return;
        const wasm = Buffer.from(match[1], "base64");
        const fileName = nameOf(wasm);
        this.emitFile({
          type: "asset",
          fileName: `assets/${fileName}`,
          source: wasm,
        });
        return {
          code: code.replace(
            '"__FD_ZSTD_WASM_FILE__"',
            JSON.stringify(fileName),
          ),
          map: null,
        };
      }

      if (!file.endsWith("zstd-js/decompress/index.js")) return;

      const match = code.match(dataUriRe);
      if (!match) {
        this.warn("zstd wasm data URI not found; leaving base64 inline");
        return;
      }

      // dead in build output (zstdDecompress.ts's dev-only branch), but
      // kept consistent if it ever survives: reference the emitted
      // asset instead of carrying the 177KB data URI
      return {
        code: code.replace(
          match[0],
          JSON.stringify(nameOf(Buffer.from(match[1], "base64"))),
        ),
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
// script also asks the blob worker to boot the real wsWorker as a
// NESTED worker (a page-spawned worker only starts once the busy main
// thread runs its post-fetch continuation task; a worker-spawned one
// starts the moment its script lands) and wire the adoption contract
// (earlyWs.ts) internally, so decode+parse completes while the main
// bundle is still fetching/evaluating; the main-thread MessagePort plus
// its pre-attach messages park on window.__fdWsMain for useWsWorker to
// attach to. Dev has no hashed names, so it keeps the blob-only path
// with main-bundle adoption. Any failure falls back one step: a nested
// spawn failure marks the handle errored (fresh worker + fresh socket);
// an inline-script throw leaves window.__fdWsEarly for the bundle to
// adopt; blob failure has the worker connect on its own.
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
        const chartWorkerFile = ctx.bundle
          ? Object.keys(ctx.bundle).find((f) =>
              /^assets\/chartWorker-[\w-]+\.js$/.test(f),
            )
          : undefined;
        // The offscreen chart worker gets the same nested treatment
        // (fetch, thread start and three.js eval all off the main-thread
        // queue); gated on the same feature test OffscreenChart.tsx uses
        // to pick the offscreen path. Own try so a throw here can't
        // strand the ws handles mid-handoff.
        const spawnChart = chartWorkerFile
          ? "try{" +
            'if(typeof OffscreenCanvas!=="undefined"&&HTMLCanvasElement.prototype.transferControlToOffscreen){' +
            "var c2=new MessageChannel();" +
            "h={port:c2.port1,early:w,error:false,pending:[]};" +
            "c2.port1.onmessage=function(m){if(h.pending.length<1e3)h.pending.push(m)};" +
            `w.postMessage({spawnChart:location.origin+${JSON.stringify("/" + chartWorkerFile)},main:c2.port2},[c2.port2]);` +
            "window.__fdChartMain=h" +
            "}}catch(x){}"
          : "";
        // The blob worker spawns the real wsWorker NESTED (worker-spawned
        // workers neither fetch-complete nor start behind main-thread
        // bundle eval) and wires adoption internally; main keeps only a
        // MessagePort channel. The spawn postMessage is the commit
        // point: any earlier throw leaves __fdWsEarly adoptable by the
        // bundle as before.
        const spawnMain = wsWorkerFile
          ? "try{" +
            "var h;" +
            "var c=new MessageChannel();" +
            `var g={port:c.port1,early:w,url:u,compress:${compress},error:false,pending:[]};` +
            // buffer the events, not data: clones deserialize lazily on
            // first data access, so big batches don't stall attach
            "c.port1.onmessage=function(m){if(g.pending.length<1e4)g.pending.push(m)};" +
            "w.onmessage=function(m){if(m.data==='error')e.error=true;else if(m.data==='closed')e.closed=true;else if(m.data==='spawnfail')g.error=true;else if(m.data==='chartspawnfail'&&h)h.error=true};" +
            `w.postMessage({spawn:location.origin+${JSON.stringify("/" + wsWorkerFile)},main:c.port2},[c.port2]);` +
            "window.__fdWsMain=g;" +
            "delete window.__fdWsEarly;" +
            spawnChart +
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
