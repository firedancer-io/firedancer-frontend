#!/usr/bin/env bash

# Re-imports the zstd decompression subset used by the frontend:
# lib/{common,decompress} + public headers.  Keep ZSTD_TAG in sync
# with src/third_party/zstd/vendor.sh in the Firedancer repo.

set -euo pipefail

cd -- "$( dirname -- "${BASH_SOURCE[0]}" )"

readonly ZSTD_TAG="v1.5.7"
readonly ZSTD_URL="https://github.com/facebook/zstd"

tmp="$( mktemp -d "${TMPDIR:-/tmp}/fd-zstd-vendor.XXXXXX" )"
trap 'rm -rf "$tmp"' EXIT

git clone --depth=1 --branch "$ZSTD_TAG" "$ZSTD_URL" "$tmp/zstd"

rm -rf lib
cp "$tmp/zstd/LICENSE" LICENSE
mkdir -p lib/common lib/decompress
cp "$tmp/zstd/lib/zstd.h" "$tmp/zstd/lib/zstd_errors.h" lib/
cp "$tmp/zstd/lib/common/"*.c "$tmp/zstd/lib/common/"*.h lib/common/
cp "$tmp/zstd/lib/decompress/"*.c "$tmp/zstd/lib/decompress/"*.h lib/decompress/
# only using single threaded decompression
rm lib/common/pool.c lib/common/pool.h \
   lib/common/threading.c lib/common/threading.h \
   lib/common/debug.c

echo "[+] Vendored zstd files from $ZSTD_TAG"
