import { commandRunner } from "@legend-apps/command-runner";

const bundledCompiler = "bundle:slides-compiler/run";
export async function compilerCommand() {
  const availability = await commandRunner.getAvailability([bundledCompiler, "bun"]);
  if (availability[bundledCompiler]) return { command: bundledCompiler, prefix: [] as string[] };
  const source = process.env.EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_PATH;
  if (!source || !availability.bun) throw new Error("The bundled Slides compiler is unavailable. Development builds require Bun and a compiler path.");
  return { command: "bun", prefix: [source] };
}
