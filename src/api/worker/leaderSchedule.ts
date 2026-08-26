/* Exact reimplementation of Firedancer's epoch leader-schedule
   derivation (fd_epoch_leaders_new). No dependencies.

   Inputs:
     epoch   - epoch number (bigint)
     weights - per-vote-account stakes in lamports (bigint[]), in the
               exact order received on the wire (`staked_lamports`).
               All entries must be > 0 (guaranteed by the backend).
     slotCnt - number of slots in the epoch (end_slot - start_slot + 1)

   Output: Uint32Array of ceil(slotCnt / 4) indices into the weights
   array (equivalently into `staked_pubkeys`), one per 4-slot rotation.

   Algorithm (bit-exact with fd_leaders.c):
     1. seed = 32-byte ChaCha20 key: epoch as u64 little-endian in
        bytes 0..7, bytes 8..31 zero.
     2. ChaCha20 keystream (RFC 8439 block fn; rand_chacha ChaCha20Rng
        layout): state words 0-3 constants, 4-11 key (LE u32s),
        12-13 = 64-bit LE block counter starting at 0, 14-15 zero.
        Blocks are concatenated in counter order; the stream is
        consumed strictly sequentially, 8 bytes (one LE u64) at a time.
     3. For each rotation: unif = ulongRoll(S) where S = total stake:
          zone = 2^64-1 - ((2^64 - S) mod S)
          loop: v = next u64 from keystream; prod = v*S (128-bit);
                if (prod mod 2^64) <= zone: return floor(prod / 2^64)
     4. index = upper-bound binary search: the number of cumulative
        prefix sums (cumsum[1..n]) that are <= unif. */

/* The per-rotation hot path avoids BigInt: u64s are handled as 32-bit
   halves and the 64x64->128 multiply as 16-bit-limb columns, all in
   Numbers. Every intermediate stays below 2^35 (column sum: carry
   < 2^18 plus four sub-products < 2^32 each), so double arithmetic is
   exact; `x & 0xffff` is x mod 2^16 for any integer < 2^53 because
   ToInt32 reduces mod 2^32 first. BigInt remains in the O(n) setup
   (cumsum, zone) where exactness near 2^64 is free. */

const MASK64 = (1n << 64n) - 1n;

/* One ChaCha20 block (RFC 8439 block fn, unrolled on locals):
   fills the 16-word `b` from key words k0/k1 (words 2-7 of the key
   are zero here) and 64-bit block counter c1:c0. */
function chachaBlock(
  b: Uint32Array,
  k0: number,
  k1: number,
  c0: number,
  c1: number,
): void {
  let x4 = k0;
  let x5 = k1;
  let x12 = c0;
  let x13 = c1;
  let x0 = 0x61707865;
  let x1 = 0x3320646e;
  let x2 = 0x79622d32;
  let x3 = 0x6b206574;
  let x6 = 0;
  let x7 = 0;
  let x8 = 0;
  let x9 = 0;
  let x10 = 0;
  let x11 = 0;
  let x14 = 0;
  let x15 = 0;
  for (let i = 0; i < 10; i++) {
    x0 = (x0 + x4) | 0;
    x12 = x12 ^ x0;
    x12 = (x12 << 16) | (x12 >>> 16);
    x8 = (x8 + x12) | 0;
    x4 = x4 ^ x8;
    x4 = (x4 << 12) | (x4 >>> 20);
    x0 = (x0 + x4) | 0;
    x12 = x12 ^ x0;
    x12 = (x12 << 8) | (x12 >>> 24);
    x8 = (x8 + x12) | 0;
    x4 = x4 ^ x8;
    x4 = (x4 << 7) | (x4 >>> 25);
    x1 = (x1 + x5) | 0;
    x13 = x13 ^ x1;
    x13 = (x13 << 16) | (x13 >>> 16);
    x9 = (x9 + x13) | 0;
    x5 = x5 ^ x9;
    x5 = (x5 << 12) | (x5 >>> 20);
    x1 = (x1 + x5) | 0;
    x13 = x13 ^ x1;
    x13 = (x13 << 8) | (x13 >>> 24);
    x9 = (x9 + x13) | 0;
    x5 = x5 ^ x9;
    x5 = (x5 << 7) | (x5 >>> 25);
    x2 = (x2 + x6) | 0;
    x14 = x14 ^ x2;
    x14 = (x14 << 16) | (x14 >>> 16);
    x10 = (x10 + x14) | 0;
    x6 = x6 ^ x10;
    x6 = (x6 << 12) | (x6 >>> 20);
    x2 = (x2 + x6) | 0;
    x14 = x14 ^ x2;
    x14 = (x14 << 8) | (x14 >>> 24);
    x10 = (x10 + x14) | 0;
    x6 = x6 ^ x10;
    x6 = (x6 << 7) | (x6 >>> 25);
    x3 = (x3 + x7) | 0;
    x15 = x15 ^ x3;
    x15 = (x15 << 16) | (x15 >>> 16);
    x11 = (x11 + x15) | 0;
    x7 = x7 ^ x11;
    x7 = (x7 << 12) | (x7 >>> 20);
    x3 = (x3 + x7) | 0;
    x15 = x15 ^ x3;
    x15 = (x15 << 8) | (x15 >>> 24);
    x11 = (x11 + x15) | 0;
    x7 = x7 ^ x11;
    x7 = (x7 << 7) | (x7 >>> 25);
    x0 = (x0 + x5) | 0;
    x15 = x15 ^ x0;
    x15 = (x15 << 16) | (x15 >>> 16);
    x10 = (x10 + x15) | 0;
    x5 = x5 ^ x10;
    x5 = (x5 << 12) | (x5 >>> 20);
    x0 = (x0 + x5) | 0;
    x15 = x15 ^ x0;
    x15 = (x15 << 8) | (x15 >>> 24);
    x10 = (x10 + x15) | 0;
    x5 = x5 ^ x10;
    x5 = (x5 << 7) | (x5 >>> 25);
    x1 = (x1 + x6) | 0;
    x12 = x12 ^ x1;
    x12 = (x12 << 16) | (x12 >>> 16);
    x11 = (x11 + x12) | 0;
    x6 = x6 ^ x11;
    x6 = (x6 << 12) | (x6 >>> 20);
    x1 = (x1 + x6) | 0;
    x12 = x12 ^ x1;
    x12 = (x12 << 8) | (x12 >>> 24);
    x11 = (x11 + x12) | 0;
    x6 = x6 ^ x11;
    x6 = (x6 << 7) | (x6 >>> 25);
    x2 = (x2 + x7) | 0;
    x13 = x13 ^ x2;
    x13 = (x13 << 16) | (x13 >>> 16);
    x8 = (x8 + x13) | 0;
    x7 = x7 ^ x8;
    x7 = (x7 << 12) | (x7 >>> 20);
    x2 = (x2 + x7) | 0;
    x13 = x13 ^ x2;
    x13 = (x13 << 8) | (x13 >>> 24);
    x8 = (x8 + x13) | 0;
    x7 = x7 ^ x8;
    x7 = (x7 << 7) | (x7 >>> 25);
    x3 = (x3 + x4) | 0;
    x14 = x14 ^ x3;
    x14 = (x14 << 16) | (x14 >>> 16);
    x9 = (x9 + x14) | 0;
    x4 = x4 ^ x9;
    x4 = (x4 << 12) | (x4 >>> 20);
    x3 = (x3 + x4) | 0;
    x14 = x14 ^ x3;
    x14 = (x14 << 8) | (x14 >>> 24);
    x9 = (x9 + x14) | 0;
    x4 = x4 ^ x9;
    x4 = (x4 << 7) | (x4 >>> 25);
  }
  b[0] = (x0 + 0x61707865) | 0;
  b[1] = (x1 + 0x3320646e) | 0;
  b[2] = (x2 + 0x79622d32) | 0;
  b[3] = (x3 + 0x6b206574) | 0;
  b[4] = (x4 + k0) | 0;
  b[5] = (x5 + k1) | 0;
  b[6] = x6;
  b[7] = x7;
  b[8] = x8;
  b[9] = x9;
  b[10] = x10;
  b[11] = x11;
  b[12] = (x12 + c0) | 0;
  b[13] = (x13 + c1) | 0;
  b[14] = x14;
  b[15] = x15;
}

export function deriveLeaderSchedule(
  epoch: bigint,
  weights: bigint[],
  slotCnt: number,
): Uint32Array {
  const cnt = weights.length;
  if (cnt === 0) throw new Error("no weights");

  /* 32-bit halves of cumsum[i+1] = sum of weights[0..i] */
  const cumHi = new Float64Array(cnt);
  const cumLo = new Float64Array(cnt);
  let sum = 0n;
  for (let i = 0; i < cnt; i++) {
    if (weights[i] <= 0n) throw new Error("non-positive weight");
    sum += weights[i];
    cumHi[i] = Number(sum >> 32n);
    cumLo[i] = Number(sum & 0xffffffffn);
  }
  const total = sum;
  if (total > MASK64) throw new Error("total weight overflows u64");

  const zone = MASK64 - (((1n << 64n) - total) % total);
  const zoneHi = Number(zone >> 32n);
  const zoneLo = Number(zone & 0xffffffffn);

  /* 16-bit limbs of total */
  const totalLo = Number(total & 0xffffffffn);
  const totalHi = Number(total >> 32n);
  const s0 = totalLo & 0xffff;
  const s1 = totalLo >>> 16;
  const s2 = totalHi & 0xffff;
  const s3 = totalHi >>> 16;

  /* Bucket index over the top bits of unif, scaled to the total:
     with sBits = bit length of total and 2^kb buckets, shift =
     sBits - kb and G[b] = number of cumsum entries <= b * 2^shift.
     unif < total, so for b = unif >> shift the answer lies in
     [G[b], G[b+1]]; expected range is cnt / 2^(kb-1), so the search
     below nearly always exits immediately. */
  let sBits = 0;
  for (let x = total; x > 0n; x >>= 1n) sBits++;
  let kb = 1;
  while (1 << kb < cnt && kb < 14) kb++;
  kb = Math.min(kb + 3, sBits);
  const shift = sBits - kb;
  const G = new Int32Array((1 << kb) + 1);
  {
    /* threshold T = b * 2^shift as 32-bit halves, stepped exactly */
    const stepLo = shift < 32 ? 2 ** shift : 0;
    const stepHi = shift < 32 ? 0 : 2 ** (shift - 32);
    let tLo = 0;
    let tHi = 0;
    let i = 0;
    for (let b = 1; b < 1 << kb; b++) {
      tLo += stepLo;
      if (tLo > 0xffffffff) {
        tLo -= 0x100000000;
        tHi++;
      }
      tHi += stepHi;
      while (
        i < cnt &&
        (cumHi[i] < tHi || (cumHi[i] === tHi && cumLo[i] <= tLo))
      )
        i++;
      G[b] = i;
    }
    G[1 << kb] = cnt;
  }
  /* unif >> shift without BigInt (see bucket compute in the loop) */
  const bFromHi = shift >= 32;
  const bHiShift = bFromHi ? shift - 32 : 0;
  const bMul = bFromHi ? 0 : 2 ** (32 - shift);

  /* ChaCha20 keystream state, consumed one LE u64 at a time */
  const e = epoch & MASK64;
  const k0 = Number(e & 0xffffffffn) | 0;
  const k1 = Number(e >> 32n) | 0;
  const block = new Uint32Array(16);
  let ctrLo = 0;
  let ctrHi = 0;
  let word = 16; /* next u32 index in block; 16 = empty */

  const schedCnt = Math.ceil(slotCnt / 4);
  const sched = new Uint32Array(schedCnt);

  for (let r = 0; r < schedCnt; r++) {
    /* ulongRoll: reject v until (v*total mod 2^64) <= zone, then
       unif = floor(v*total / 2^64) */
    let uHi = 0;
    let uLo = 0;
    for (;;) {
      if (word === 16) {
        chachaBlock(block, k0, k1, ctrLo, ctrHi);
        ctrLo = (ctrLo + 1) >>> 0;
        if (ctrLo === 0) ctrHi = (ctrHi + 1) >>> 0;
        word = 0;
      }
      const vLo = block[word];
      const vHi = block[word + 1];
      word += 2;
      const v0 = vLo & 0xffff;
      const v1 = vLo >>> 16;
      const v2 = vHi & 0xffff;
      const v3 = vHi >>> 16;

      /* low 64 bits of the 128-bit product, column by column */
      let t = v0 * s0;
      const p0 = t & 0xffff;
      t = (t - p0) / 0x10000 + v0 * s1 + v1 * s0;
      const p1 = t & 0xffff;
      t = (t - p1) / 0x10000 + v0 * s2 + v1 * s1 + v2 * s0;
      const p2 = t & 0xffff;
      t = (t - p2) / 0x10000 + v0 * s3 + v1 * s2 + v2 * s1 + v3 * s0;
      const p3 = t & 0xffff;

      const loHi = p3 * 0x10000 + p2;
      const loLo = p1 * 0x10000 + p0;
      if (loHi < zoneHi || (loHi === zoneHi && loLo <= zoneLo)) {
        /* accepted: high 64 bits */
        t = (t - p3) / 0x10000 + v1 * s3 + v2 * s2 + v3 * s1;
        const p4 = t & 0xffff;
        t = (t - p4) / 0x10000 + v2 * s3 + v3 * s2;
        const p5 = t & 0xffff;
        t = (t - p5) / 0x10000 + v3 * s3;
        const p6 = t & 0xffff;
        const p7 = (t - p6) / 0x10000;
        uLo = p5 * 0x10000 + p4;
        uHi = p7 * 0x10000 + p6;
        break;
      }
    }

    /* upper-bound binary search within the bucket: smallest i with
       cumsum[i+1] > unif */
    const b = bFromHi ? uHi >>> bHiShift : uHi * bMul + (uLo >>> shift);
    let lo = G[b];
    let hi = G[b + 1];
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const cHi = cumHi[mid];
      if (cHi < uHi || (cHi === uHi && cumLo[mid] <= uLo)) lo = mid + 1;
      else hi = mid;
    }
    sched[r] = lo;
  }
  return sched;
}

/* FNV-1a-64 over sched entries as u32 LE bytes; must match the
   backend's leader_slots_hash (see epochNewSchema). h is kept as four
   16-bit limbs; h * prime mod 2^64 with prime = 2^40 + 0x1b3 keeps
   every column below 2^26, exact in Numbers. */
export function schedFnv1a64(sched: Uint32Array): string {
  /* 0xcbf29ce484222325, low limb first */
  let h0 = 0x2325;
  let h1 = 0x8422;
  let h2 = 0x9ce4;
  let h3 = 0xcbf2;
  for (let i = 0; i < sched.length; i++) {
    const v = sched[i];
    for (let b = 0; b < 32; b += 8) {
      h0 ^= (v >>> b) & 0xff;
      let t = h0 * 0x1b3;
      const n0 = t & 0xffff;
      t = (t - n0) / 0x10000 + h1 * 0x1b3;
      const n1 = t & 0xffff;
      t = (t - n1) / 0x10000 + h2 * 0x1b3 + (h0 << 8);
      const n2 = t & 0xffff;
      t = (t - n2) / 0x10000 + h3 * 0x1b3 + (h1 << 8);
      h3 = t & 0xffff;
      h0 = n0;
      h1 = n1;
      h2 = n2;
    }
  }
  return (
    (h3 * 0x10000 + h2).toString(16).padStart(8, "0") +
    (h1 * 0x10000 + h0).toString(16).padStart(8, "0")
  );
}
