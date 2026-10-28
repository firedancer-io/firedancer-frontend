import wasmUrl from "./zstd-dec.wasm?url";

interface ZstdExports {
  memory: WebAssembly.Memory;
  buf(inSz: number, outCap: number): number;
  bound(inPtr: number, inSz: number): number;
  dec(inPtr: number, inSz: number, outPtr: number, outCap: number): number;
}

// bound() and dec() return size_t, which is u32 in wasm32 but arrives
// in JS as i32. The C side caps sizes at 1 GiB, so -1 is the only
// negative value.
const decErr = -1;

export interface ZstdDecoder {
  /** Decompresses one or more concatenated zstd frames */
  decompress(data: Uint8Array): Uint8Array;
}

export async function instantiateZstd(
  source: BufferSource,
): Promise<ZstdDecoder> {
  const { instance } = await WebAssembly.instantiate(source);
  const wasm = instance.exports as unknown as ZstdExports;

  // buf() may grow memory, which detaches earlier views
  function alloc(inSize: number, outCapacity: number) {
    const ptr = wasm.buf(inSize, outCapacity);
    if (!ptr) throw new Error("zstd: out of memory");
    return ptr;
  }

  return {
    decompress(data) {
      const ptr = alloc(data.length, 0);
      new Uint8Array(wasm.memory.buffer, ptr, data.length).set(data);
      const outCapacity = wasm.bound(ptr, data.length);
      if (outCapacity === decErr) throw new Error("zstd: corrupt input");
      // Same region as before, so the copied input is still in place
      alloc(data.length, outCapacity);
      const outPtr = ptr + data.length;
      const n = wasm.dec(ptr, data.length, outPtr, outCapacity);
      if (n === decErr) throw new Error("zstd: corrupt input");
      return new Uint8Array(wasm.memory.buffer, outPtr, n).slice();
    },
  };
}

export async function loadZstd(): Promise<ZstdDecoder> {
  const response = await fetch(wasmUrl);
  return instantiateZstd(await response.arrayBuffer());
}
