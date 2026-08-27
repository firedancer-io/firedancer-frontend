import { fetchWasm } from "./zstdWasmPrefetch";

/**
 * Minimal decompress-only runtime over the emscripten-built zstd wasm
 * that @oneidentity/zstd-js ships. The package's worker-side JS is
 * ~460KB minified (a wasm2js fallback plus an assertions emscripten
 * runtime) and its V8 parse dominated wsWorker startup; the wasm
 * itself needs only three trivial env imports, so this instantiates
 * the same hashed .wasm asset (extracted by zstdWasmAsset() in
 * vite.config.ts) and exposes the one call the worker uses. Dev and
 * tests don't run the build plugin and keep the package
 * implementation; the dead branch is eliminated from build output.
 */

export interface ZstdDecoder {
  ZstdStream: { decompress(data: Uint8Array): Uint8Array };
}

interface ZstdExports {
  memory: WebAssembly.Memory;
  __wasm_call_ctors(): void;
  emscripten_stack_init?(): void;
  malloc(n: number): number;
  free(p: number): void;
  ZSTD_isError(code: number): number;
  // i64 return legalized by emscripten: JS sees the low 32 bits
  ZSTD_getFrameContentSize(src: number, size: number): number;
  ZSTD_decompress(
    dst: number,
    dstCap: number,
    src: number,
    srcSize: number,
  ): number;
  ZSTD_createDStream(): number;
  ZSTD_initDStream(d: number): number;
  ZSTD_freeDStream(d: number): number;
  ZSTD_DStreamOutSize(): number;
  ZSTD_decompressStream_simpleArgs(
    d: number,
    dst: number,
    dstCap: number,
    dstPos: number,
    src: number,
    srcSize: number,
    srcPos: number,
  ): number;
}

export async function ZstdInit(): Promise<ZstdDecoder> {
  if (!import.meta.env.PROD) {
    const pkg = await import("@oneidentity/zstd-js/decompress");
    return (await pkg.ZstdInit()) as unknown as ZstdDecoder;
  }

  // assigned once instantiation returns; env closures run only after
  // eslint-disable-next-line prefer-const
  let exp: ZstdExports;
  let heapU8: Uint8Array;
  const refresh = () => {
    heapU8 = new Uint8Array(exp.memory.buffer);
  };
  const env = {
    emscripten_resize_heap(requested: number): number {
      const cur = exp.memory.buffer.byteLength;
      if (requested > cur) {
        // overshoot caps regrow churn on the multi-MB burst frames
        const target = Math.max(
          requested,
          Math.min(2 * cur, requested + (8 << 20)),
        );
        try {
          exp.memory.grow(Math.ceil((target - cur) / 65536));
        } catch {
          try {
            exp.memory.grow(Math.ceil((requested - cur) / 65536));
          } catch {
            return 0;
          }
        }
        refresh();
      }
      return 1;
    },
    emscripten_memcpy_big(dst: number, src: number, n: number): void {
      heapU8.copyWithin(dst, src, src + n);
    },
    setTempRet0(_v: number): void {},
  };

  const { instance } = await WebAssembly.instantiateStreaming(fetchWasm(), {
    env,
  });
  exp = instance.exports as unknown as ZstdExports;
  exp.emscripten_stack_init?.();
  exp.__wasm_call_ctors();
  refresh();

  const alloc = (n: number): number => {
    const p = exp.malloc(n);
    if (!p) throw new Error("zstd: out of memory");
    return p;
  };

  /* Unknown-content-size frames (not produced by ZSTD_compress2
     backends, kept for wire-format safety) */
  function decompressStream(srcPtr: number, srcSize: number): Uint8Array {
    const d = exp.ZSTD_createDStream();
    if (!d) throw new Error("zstd: createDStream failed");
    const posPtr = alloc(8); // [dstPos u32, srcPos u32]
    const outCap = exp.ZSTD_DStreamOutSize();
    const outPtr = alloc(outCap);
    try {
      exp.ZSTD_initDStream(d);
      const chunks: Uint8Array[] = [];
      let total = 0;
      let srcPos = 0;
      for (;;) {
        let dv = new DataView(exp.memory.buffer);
        dv.setUint32(posPtr, 0, true);
        dv.setUint32(posPtr + 4, srcPos, true);
        const ret = exp.ZSTD_decompressStream_simpleArgs(
          d,
          outPtr,
          outCap,
          posPtr,
          srcPtr,
          srcSize,
          posPtr + 4,
        );
        if (exp.ZSTD_isError(ret)) throw new Error("zstd: stream error");
        dv = new DataView(exp.memory.buffer); // calls may grow memory
        const dstPos = dv.getUint32(posPtr, true);
        srcPos = dv.getUint32(posPtr + 4, true);
        if (dstPos) {
          chunks.push(heapU8.slice(outPtr, outPtr + dstPos));
          total += dstPos;
        }
        if (srcPos >= srcSize) {
          if (ret === 0) break;
          if (!dstPos) throw new Error("zstd: truncated frame");
        }
      }
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        out.set(c, off);
        off += c.length;
      }
      return out;
    } finally {
      exp.free(outPtr);
      exp.free(posPtr);
      exp.ZSTD_freeDStream(d);
    }
  }

  function decompress(data: Uint8Array): Uint8Array {
    const srcSize = data.length;
    const srcPtr = alloc(srcSize);
    heapU8.set(data, srcPtr);
    try {
      const contentSize = exp.ZSTD_getFrameContentSize(srcPtr, srcSize);
      if (contentSize === 0) return new Uint8Array(0);
      if (contentSize < 0) return decompressStream(srcPtr, srcSize);
      const dstPtr = alloc(contentSize);
      try {
        const n = exp.ZSTD_decompress(dstPtr, contentSize, srcPtr, srcSize);
        if (exp.ZSTD_isError(n)) throw new Error("zstd: decompress error");
        return heapU8.slice(dstPtr, dstPtr + n);
      } finally {
        exp.free(dstPtr);
      }
    } finally {
      exp.free(srcPtr);
    }
  }

  return { ZstdStream: { decompress } };
}
