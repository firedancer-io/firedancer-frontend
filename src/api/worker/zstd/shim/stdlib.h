#pragma once
#include <stddef.h>
/* zstd only allocates through these when no static workspace is given;
   zstd.c always passes one, so allocation simply fails. */
static inline void * malloc( size_t n )           { (void)n; return 0; }
static inline void * calloc( size_t n, size_t s ) { (void)n; (void)s; return 0; }
static inline void   free  ( void * p )           { (void)p; }
