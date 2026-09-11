# Highlight queries

Each sibling grammar directory contains its unmodified upstream `highlights.scm`,
license and revision. `tree-sitter-grammars.json` defines aliases and query
inheritance; TS and TSX inherit JS highlights, but not JS's JSX refinements.

`Highlights.hpp` embeds these files and the registry for native builds, avoiding
runtime filesystem or bundle lookup. App-authored escape/shorthand/JSX refinements
live in the package's top-level `queries/` directory. The wrapper evaluates the pinned `match?`, `eq?`, and `is-not? local`
predicates; unknown predicate operators fail loudly at setup.

Local builtin suppression handles JS/TS binding patterns, import aliases,
parameters, catches, class names and function-scoped var declarations. This is
syntactic highlighting, not TypeScript semantic analysis. Markdown/MDX use shared
inline/YAML/fenced-language regions. Generated capture IDs include root scopes so
embedded code keeps its language's theme selectors. See `TREE_SITTER.md` for the
remaining composition/dialect limits.
