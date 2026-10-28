#!/usr/bin/env bash

# Rebuilds zstd-dec.wasm from the vendored zstd sources.  Requires clang and
# wasm-ld with the wasm32 target.  The committed zstd-dec.wasm was built
# with clang 20; other versions enable different default wasm features
# and produce a different (but compatible) binary.

set -euo pipefail

cd -- "$( dirname -- "${BASH_SOURCE[0]}" )"

readonly CLANG="${CLANG:-clang}"
readonly Z=../../../third_party/zstd/lib

"$CLANG" --target=wasm32 -nostdlib -ffreestanding -O3 \
  -mbulk-memory -msimd128 \
  -fno-ident -ffile-prefix-map="$PWD"=. \
  -DNDEBUG -DDEBUGLEVEL=0 \
  -DZSTD_NO_INTRINSICS -DZSTD_DISABLE_ASM -DZSTD_LEGACY_SUPPORT=0 \
  -DZSTD_NO_TRACE -DZSTD_STRIP_ERROR_STRINGS -DXXH_NO_STDLIB \
  -Ishim -I"$Z" -I"$Z/common" \
  zstd.c \
  "$Z/common/entropy_common.c" "$Z/common/error_private.c" \
  "$Z/common/fse_decompress.c" "$Z/common/zstd_common.c" \
  "$Z/common/xxhash.c" \
  "$Z/decompress/huf_decompress.c" "$Z/decompress/zstd_ddict.c" \
  "$Z/decompress/zstd_decompress.c" "$Z/decompress/zstd_decompress_block.c" \
  -Wl,--no-entry,--export-memory,--strip-all \
  -o zstd-dec.wasm

echo "[+] Built $( wc -c < zstd-dec.wasm ) byte zstd-dec.wasm"
