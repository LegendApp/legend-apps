import { resolveCommand, type ProcessTarget } from "@legendapp/spark/processes";
export async function compilerCommand(): Promise<{ target: ProcessTarget; prefix: string[] }> {
  if (!__DEV__) return { target: { type: "helper", name: "slides-compiler" }, prefix: [] };
  const source = process.env.EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_PATH;
  const bun = await resolveCommand("bun");
  if (!source || !bun) throw new Error("Development builds require Bun and a Slides compiler path.");
  return { target: { type: "executable", path: bun }, prefix: [source] };
}
