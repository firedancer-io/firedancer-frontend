import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { constants, zstdCompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { instantiateZstd } from "../zstd";

const wasm = readFileSync(resolve(__dirname, "../zstd-dec.wasm"));
const encoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Like the validator's one-shot ZSTD_compress2, Node writes the content
// size into the frame header by default
function compress(text: string, contentSize = true) {
  return zstdCompressSync(encoder.encode(text), {
    params: { [constants.ZSTD_c_contentSizeFlag]: contentSize ? 1 : 0 },
  });
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

describe("zstd", () => {
  it("decodes a single frame", async () => {
    const zstd = await instantiateZstd(wasm);
    const text = JSON.stringify({ topic: "summary", key: "ping", value: 1 });
    expect(textDecoder.decode(zstd.decompress(compress(text)))).toBe(text);
  });

  it("decodes concatenated frames", async () => {
    const zstd = await instantiateZstd(wasm);
    const head = '{"topic":"timeline","key":"query_slots","id":7,';
    const body = `"value":${JSON.stringify(Array.from({ length: 1000 }, (_, i) => i))}}`;
    const out = zstd.decompress(concat(compress(head), compress(body)));
    expect(textDecoder.decode(out)).toBe(head + body);
  });

  it("grows memory for highly compressible input", async () => {
    const zstd = await instantiateZstd(wasm);
    const text = "a".repeat(8 << 20);
    expect(textDecoder.decode(zstd.decompress(compress(text)))).toBe(text);
    // and stays usable after memory growth
    expect(textDecoder.decode(zstd.decompress(compress("ok")))).toBe("ok");
  });

  it("decodes frames without content size", async () => {
    const zstd = await instantiateZstd(wasm);
    const text = "a".repeat(8 << 20);
    const out = zstd.decompress(
      concat(compress("ok", false), compress(text, false)),
    );
    expect(textDecoder.decode(out)).toBe("ok" + text);
  });

  it("rejects output over 1 GiB", async () => {
    const zstd = await instantiateZstd(wasm);
    // Frame header declaring 2^31 content bytes, then one RLE block
    const frame = new Uint8Array([
      0x28, 0xb5, 0x2f, 0xfd, 0xa0, 0, 0, 0, 0x80, 0x0b, 0, 0, 0x61,
    ]);
    expect(() => zstd.decompress(frame)).toThrow("zstd: corrupt input");
  });

  it("rejects corrupt input", async () => {
    const zstd = await instantiateZstd(wasm);
    const frame = compress("x".repeat(1000));
    expect(() => zstd.decompress(frame.subarray(0, frame.length - 4))).toThrow(
      "zstd: corrupt input",
    );
  });
});
