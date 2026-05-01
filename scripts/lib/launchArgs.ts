type OptionKind = "boolean" | "value";

export type OptionSpecs = Record<string, OptionKind>;

export function splitLaunchArgs(args: string[], optionSpecs: OptionSpecs) {
  const runnerArgs: string[] = [];
  const launchArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      launchArgs.push(...args.slice(index + 1));
      break;
    }

    const optionName = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    const optionKind = optionSpecs[optionName];

    if (!optionKind) {
      launchArgs.push(arg);
      continue;
    }

    runnerArgs.push(arg);
    if (optionKind === "value" && !arg.includes("=") && index + 1 < args.length) {
      index += 1;
      runnerArgs.push(args[index]);
    }
  }

  return { launchArgs, runnerArgs };
}
