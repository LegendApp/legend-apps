# Branch fans

`BranchFan` accepts one root point, downward endpoints, canvas dimensions, strands,
twist and two palettes. The `emphasized` flag changes palette on the shared step
clock. `createBranchFanShader` exposes the same material for custom compositions.
It is a visual fan of curved ribbons, not a general graph layout engine.

Put your own nodes, labels, images and narrative above it. Endpoints must lie below
the root, and the pack limits fanout to 32 and strands to four. Shaders are cached
with a bound of 32. The manifest declares its exact materials-pack dependency so a
future installer can include that source without bundling unrelated effects.
