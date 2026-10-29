This directory contains the decompression subset of the Zstandard
library at https://github.com/facebook/zstd

Files are copied exactly from tag v1.5.7, the same tag vendored by the
Firedancer validator (src/third_party/zstd), with no modifications.
Do not edit vendored files locally; update by re-running `vendor.sh`
against a new pinned tag, then rebuild the decoder with
src/api/worker/zstd/build.sh.

Only lib/common and lib/decompress are imported (no compression,
dictBuilder, legacy/ or deprecated/ sources).  The decoder is compiled
single-threaded to WebAssembly and uses the ZSTD_STATIC_LINKING_ONLY
static-allocation API, which upstream marks unstable -- version bumps
must re-audit src/api/worker/zstd/zstd.c.

zstd is dual-licensed BSD-3-Clause OR GPL-2.0; it is taken here
under BSD-3-Clause only (LICENSE in this directory; upstream's
COPYING/GPL text is deliberately not imported).  See also NOTICE in
the root of this repo.
