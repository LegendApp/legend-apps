# TypeGPU Clouds source

`consts.ts`, `types.ts`, and `utils.ts` are verbatim copies of TypeGPU's
`rendering/clouds` example at tag `v0.12.4` (commit
`2d43507f6b79c7b550d55f5a988468b47f4ca7df`).

`scene.ts` adapts the example's browser entry point to Legend Slides' built-in
`TypeGPU` scene contract. It removes DOM canvas setup, resize observation, the
browser animation loop, and controls; the app host owns those platform details.

Source: https://github.com/software-mansion/TypeGPU/tree/v0.12.4/apps/typegpu-docs/src/examples/rendering/clouds
