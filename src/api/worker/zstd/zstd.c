/* WebAssembly zstd decoder for the websocket worker.

   Built from the vendored zstd v1.5.7 sources in src/third_party/zstd
   (the same tag the validator compresses with) by build.sh.  There is
   no libc: the shim/ headers provide the few declarations zstd needs,
   and all memory is a single bump region after a static DCtx.

   A websocket message may hold several concatenated zstd frames (the
   server can prefix a cached, already compressed response with a small
   per-connection frame).  ZSTD_decompressDCtx already decodes
   concatenated frames and writes their concatenated content. */

#define ZSTD_STATIC_LINKING_ONLY
#include "zstd.h"
#include <stddef.h>

void * memcpy ( void * d, void const * s, size_t n ) { return __builtin_memcpy ( d, s, n ); }
void * memmove( void * d, void const * s, size_t n ) { return __builtin_memmove( d, s, n ); }
void * memset ( void * p, int v, size_t n )          { return __builtin_memset ( p, v, n ); }

int
memcmp( void const * a, void const * b, size_t n ) {
  unsigned char const * x = a;
  unsigned char const * y = b;
  for( size_t i=0; i<n; i++ ) if( x[ i ]!=y[ i ] ) return x[ i ]-y[ i ];
  return 0;
}

extern unsigned char __heap_base;

static unsigned char * heap = &__heap_base;
static ZSTD_DCtx *     dctx;

static int
reserve( size_t sz ) {
  size_t have = __builtin_wasm_memory_size( 0 )*65536UL;
  size_t need = (size_t)heap + sz;
  if( need<(size_t)heap ) return 0;
  if( need<=have ) return 1;
  return __builtin_wasm_memory_grow( 0, (need-have+65535UL)/65536UL )!=(size_t)-1;
}

/* buf returns a region of at least in_sz+out_cap bytes (input first,
   output at +in_sz), or 0 if memory cannot grow.  Memory may move, so
   JS must re-read the memory buffer after every call. */

__attribute__((export_name("buf"))) unsigned char *
buf( size_t in_sz,
     size_t out_cap ) {
  if( !dctx ) {
    size_t sz = ZSTD_estimateDCtxSize();
    if( !reserve( sz ) ) return 0;
    dctx = ZSTD_initStaticDCtx( heap, sz );
    if( !dctx ) return 0;
    heap += (sz+15UL)&~15UL;
  }
  if( in_sz+out_cap<in_sz || !reserve( in_sz+out_cap ) ) return 0;
  return heap;
}

/* bound returns an upper bound on the decompressed size of every frame
   in [in,in+in_sz), exact when frame headers declare their content
   size (the validator's do).  Returns (size_t)-1 on corrupt input or
   if the bound exceeds 1 GiB, which also keeps every size seen by JS
   below 2^31 (wasm32 size_t arrives in JS as a signed i32). */

__attribute__((export_name("bound"))) size_t
bound( unsigned char const * in,
       size_t                in_sz ) {
  unsigned long long b = ZSTD_decompressBound( in, in_sz );
  return b>(1UL<<30) ? (size_t)-1 : (size_t)b; /* also catches ZSTD_CONTENTSIZE_ERROR */
}

/* dec decompresses every frame in [in,in+in_sz) into out, which must
   hold at least bound( in, in_sz ) bytes.  Returns the number of bytes
   written or (size_t)-1 on corrupt input. */

__attribute__((export_name("dec"))) size_t
dec( unsigned char const * in,
     size_t                in_sz,
     unsigned char *       out,
     size_t                out_cap ) {
  if( !dctx ) return (size_t)-1;
  size_t r = ZSTD_decompressDCtx( dctx, out, out_cap, in, in_sz );
  return ZSTD_isError( r ) ? (size_t)-1 : r;
}
