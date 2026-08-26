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

const MASK64 = (1n << 64n) - 1n;

/* One ChaCha quarter round on block words a, b, c, d. */
function quarterRound(
  x: Uint32Array,
  a: number,
  b: number,
  c: number,
  d: number,
) {
  x[a] = (x[a] + x[b]) | 0;
  x[d] ^= x[a];
  x[d] = (x[d] << 16) | (x[d] >>> 16);
  x[c] = (x[c] + x[d]) | 0;
  x[b] ^= x[c];
  x[b] = (x[b] << 12) | (x[b] >>> 20);
  x[a] = (x[a] + x[b]) | 0;
  x[d] ^= x[a];
  x[d] = (x[d] << 8) | (x[d] >>> 24);
  x[c] = (x[c] + x[d]) | 0;
  x[b] ^= x[c];
  x[b] = (x[b] << 7) | (x[b] >>> 25);
}

/* ChaCha20 keystream reader: sequential 8-byte LE u64 reads. */
class ChaCha20Stream {
  private key = new Uint32Array(8);
  private counter = 0n; /* 64-bit block counter */
  private init = new Uint32Array(16);
  private block = new Uint32Array(16);
  private word = 16; /* next u32 index in block; 16 = empty */

  constructor(epoch: bigint) {
    /* key = epoch as u64 LE in bytes 0..7 of the 32-byte seed */
    const e = epoch & MASK64;
    this.key[0] = Number(e & 0xffffffffn);
    this.key[1] = Number(e >> 32n);
  }

  private refill(): void {
    const s = this.init;
    const x = this.block;
    s[0] = 0x61707865;
    s[1] = 0x3320646e;
    s[2] = 0x79622d32;
    s[3] = 0x6b206574;
    s.set(this.key, 4);
    s[12] = Number(this.counter & 0xffffffffn);
    s[13] = Number(this.counter >> 32n);
    s[14] = 0;
    s[15] = 0;
    x.set(s);
    for (let i = 0; i < 10; i++) {
      quarterRound(x, 0, 4, 8, 12);
      quarterRound(x, 1, 5, 9, 13);
      quarterRound(x, 2, 6, 10, 14);
      quarterRound(x, 3, 7, 11, 15);
      quarterRound(x, 0, 5, 10, 15);
      quarterRound(x, 1, 6, 11, 12);
      quarterRound(x, 2, 7, 8, 13);
      quarterRound(x, 3, 4, 9, 14);
    }
    for (let i = 0; i < 16; i++) x[i] = (x[i] + s[i]) | 0;
    this.counter = (this.counter + 1n) & MASK64;
    this.word = 0;
  }

  /* Next u64 (little-endian) from the keystream as a bigint. */
  nextU64(): bigint {
    if (this.word >= 16) this.refill();
    const lo = this.block[this.word];
    const hi = this.block[this.word + 1];
    this.word += 2;
    return BigInt(lo) | (BigInt(hi) << 32n);
  }
}

/* Uniform u64 in [0, n): rand 0.7 UniformInt<u64> "MOD" flavor. */
function ulongRoll(stream: ChaCha20Stream, n: bigint, zone: bigint): bigint {
  for (;;) {
    const v = stream.nextU64();
    const prod = v * n;
    if ((prod & MASK64) <= zone) return prod >> 64n;
  }
}

export function deriveLeaderSchedule(
  epoch: bigint,
  weights: bigint[],
  slotCnt: number,
): Uint32Array {
  const cnt = weights.length;
  if (cnt === 0) throw new Error("no weights");

  /* cumulative sums; cumsum[i] = sum of weights[0..i) */
  const cumsum = new Array<bigint>(cnt + 1);
  cumsum[0] = 0n;
  for (let i = 0; i < cnt; i++) {
    if (weights[i] <= 0n) throw new Error("non-positive weight");
    cumsum[i + 1] = cumsum[i] + weights[i];
  }
  const total = cumsum[cnt];
  if (total > MASK64) throw new Error("total weight overflows u64");

  const zone = MASK64 - (((1n << 64n) - total) % total);

  const stream = new ChaCha20Stream(epoch);
  const schedCnt = Math.ceil(slotCnt / 4);
  const sched = new Uint32Array(schedCnt);

  for (let r = 0; r < schedCnt; r++) {
    const unif = ulongRoll(stream, total, zone);
    /* upper-bound binary search: smallest i with cumsum[i+1] > unif */
    let lo = 0;
    let hi = cnt;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cumsum[mid + 1] <= unif) lo = mid + 1;
      else hi = mid;
    }
    sched[r] = lo;
  }
  return sched;
}

/* FNV-1a-64 over sched entries as u32 LE bytes; must match the
   backend's leader_slots_hash (see epochNewSchema). */
export function schedFnv1a64(sched: Uint32Array): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < sched.length; i++) {
    const v = sched[i];
    for (let b = 0; b < 4; b++) {
      h ^= BigInt((v >>> (8 * b)) & 0xff);
      h = (h * prime) & MASK64;
    }
  }
  return h.toString(16).padStart(16, "0");
}
