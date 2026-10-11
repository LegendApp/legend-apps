import { resolveCommand, runCommand, type ProcessTarget } from "@legendapp/spark/processes";
import { CompilerRuntimeMissingError, compilerRuntimeGeneration, invalidateCompilerRuntime, resolveCompilerRuntime } from "./compilerRuntime";
export async function compilerCommand(refresh = false): Promise<{ target: ProcessTarget; prefix: string[]; env?: Record<string, string>; generation?: number }> {
  if (!__DEV__) {
    // The shipped helper has no JavaScript runtime of its own; tell its launcher which one to use.
    const runtime = await resolveCompilerRuntime({ refresh });
    if (!runtime) throw new CompilerRuntimeMissingError();
    return { target: { type: "helper", name: "slides-compiler" }, prefix: [], generation: compilerRuntimeGeneration(), env: { LEGEND_SLIDES_RUNTIME: runtime.path } };
  }
  const source = process.env.EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_PATH;
  const bun = await resolveCommand("bun");
  if (!source || !bun) throw new Error("Development builds require Bun and a Slides compiler path.");
  return { target: { type: "executable", path: bun }, prefix: [source] };
}

/** A cached runtime can vanish; rediscover and retry once before asking for installation. */
export async function runCompilerCommand(args: string[], options: Pick<Parameters<typeof runCommand>[0], "input" | "timeoutMs"> = {}, checkCancelled?: () => void) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const compiler = await compilerCommand(attempt === 1);
      checkCancelled?.();
      const result = await runCommand({ ...options, target: compiler.target, env: compiler.env, args: [...compiler.prefix, ...args] });
      checkCancelled?.();
      if (__DEV__ || result.exit.type !== "exited" || result.exit.code !== 127) return result;
      if (attempt === 1) {
        if (compiler.generation !== compilerRuntimeGeneration()) {
          // Recovery superseded this command; retry the current runtime without refreshing it.
          attempt = -1;
          continue;
        }
        invalidateCompilerRuntime(compiler.generation!);
        throw new CompilerRuntimeMissingError();
      }
    } catch (error) {
      if (!(error instanceof CompilerRuntimeMissingError) || attempt === 1) throw error;
    }
  }
  throw new CompilerRuntimeMissingError();
}
