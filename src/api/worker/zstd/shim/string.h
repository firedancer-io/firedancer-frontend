#pragma once
#include <stddef.h>
void * memcpy ( void * d, void const * s, size_t n );
void * memmove( void * d, void const * s, size_t n );
void * memset ( void * p, int v, size_t n );
int    memcmp ( void const * a, void const * b, size_t n );
