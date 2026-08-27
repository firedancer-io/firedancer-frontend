/**
 * Runs first in the worker bundle: starts the zstd wasm download before
 * the zod schemas build, and hands the in-flight Response to
 * zstdDecompress.ts's instantiateStreaming (the hashed asset name below
 * is filled in by zstdWasmAsset() in vite.config.ts, which also emits
 * the asset). Consumed at most once; any later or fallback load path
 * re-fetches. A response without the application/wasm type (the
 * validator serves .wasm untyped) is rewrapped so streaming compile is
 * not rejected.
 */
const wasmFile = "__FD_ZSTD_WASM_FILE__"; // dev/test: placeholder stays, no-op

const scope = self as unknown as {
  __fdZstdWasmFetch?: () => Promise<Response>;
};

function fetchWasmFresh(): Promise<Response> {
  return fetch(new URL(wasmFile, self.location.href), {
    credentials: "same-origin",
  }).then((r) =>
    r.ok && r.headers.get("content-type")?.split(";")[0] !== "application/wasm"
      ? new Response(r.body, {
          status: r.status,
          headers: { "Content-Type": "application/wasm" },
        })
      : r,
  );
}

/** The in-flight prefetch, or a fresh download once it's consumed */
export function fetchWasm(): Promise<Response> {
  if (scope.__fdZstdWasmFetch) {
    const consume = scope.__fdZstdWasmFetch;
    scope.__fdZstdWasmFetch = undefined;
    return consume();
  }
  return fetchWasmFresh();
}

if (!wasmFile.startsWith("__")) {
  const response = fetchWasmFresh();
  // swallow a rejection landing before ZstdInit consumes it
  void response.catch(() => undefined);
  scope.__fdZstdWasmFetch = () => response;
}
