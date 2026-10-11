import { resolveCommand, type ProcessTarget } from "@legendapp/spark/processes";
import { CompilerRuntimeMissingError, resolveCompilerRuntime } from "./compilerRuntime";
export async function compilerCommand(): Promise<{ target: ProcessTarget; prefix: string[]; env?: Record<string, string> }> {
  if (!__DEV__) {
    // The shipped helper has no JavaScript runtime of its own; tell its launcher which one to use.
    const runtime = await resolveCompilerRuntime();
    if (!runtime) throw new CompilerRuntimeMissingError();
    return { target: { type: "helper", name: "slides-compiler" }, prefix: [], env: { LEGEND_SLIDES_RUNTIME: runtime.path } };
  }
  const source = process.env.EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_PATH;
  const bun = await resolveCommand("bun");
  if (!source || !bun) throw new Error("Development builds require Bun and a Slides compiler path.");
  return { target: { type: "executable", path: bun }, prefix: [source] };
}
