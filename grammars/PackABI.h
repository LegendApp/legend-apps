#pragma once
#include <stdint.h>

// One parser and its matching highlighting query, signed as a single library.
// Libraries never own the Tree-sitter runtime. Increment this for layout changes.
typedef struct TSLanguage TSLanguage;
typedef struct LegendGrammarPackV1 {
  uint32_t abi;
  const char *name;
  const char *scope;
  const char *query;
  const TSLanguage *(*language)(void);
} LegendGrammarPackV1;
typedef const LegendGrammarPackV1 *(*LegendGrammarPackFactory)(void);
