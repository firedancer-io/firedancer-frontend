/**
 * Runs first in the worker bundle: starts the zstd wasm download before
 * the zstd module evaluates and the zod schemas build, and hands the
 * in-flight Response to the package's instantiateStreaming (its fetch
 * sites are rewired to __fdZstdWasmFetch by zstdWasmAsset() in
 * vite.config.ts, which also fills in the hashed asset name below).
 * Consumed at most once; any later or fallback load path re-fetches.
 * A response without the application/wasm type (the validator serves
 * .wasm untyped) is rewrapped so streaming compile is not rejected.
 */
const wasmFile = "__FD_ZSTD_WASM_FILE__"; // dev/test: placeholder stays, no-op

const scope = self as unknown as {
  __fdZstdWasmFetch?: () => Promise<Response>;
};

if (!wasmFile.startsWith("__")) {
  const response = fetch(new URL(wasmFile, self.location.href), {
    credentials: "same-origin",
  }).then((r) =>
    r.ok && r.headers.get("content-type")?.split(";")[0] !== "application/wasm"
      ? new Response(r.body, {
          status: r.status,
          headers: { "Content-Type": "application/wasm" },
        })
      : r,
  );
  // swallow a rejection landing before ZstdInit consumes it
  void response.catch(() => undefined);
  scope.__fdZstdWasmFetch = () => {
    scope.__fdZstdWasmFetch = undefined;
    return response;
  };
}

export {};
