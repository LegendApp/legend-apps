import { createInterface } from "node:readline/promises";

export class PromptCancelled extends Error {
  constructor() {
    super("Cancelled.");
  }
}

export function createPrompts() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("This command needs an interactive terminal. Use --help for scripted alternatives.");
  }

  const reader = createInterface({ input: process.stdin, output: process.stdout });
  const controller = new AbortController();
  reader.on("close", () => controller.abort());
  reader.on("SIGINT", () => reader.close());

  async function ask(question: string, fallback = "") {
    if (controller.signal.aborted) {
      throw new PromptCancelled();
    }
    try {
      const answer = await reader.question(`${question}${fallback ? ` [${fallback}]` : ""}: `, {
        signal: controller.signal,
      });
      return answer.trim() || fallback;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new PromptCancelled();
      }
      throw error;
    }
  }

  return {
    ask,
    close: () => reader.close(),
    async confirm(question: string, defaultYes = false) {
      while (true) {
        const answer = (await ask(`${question} (${defaultYes ? "Y/n" : "y/N"})`, defaultYes ? "y" : "n")).toLowerCase();
        if (answer === "y" || answer === "yes") return true;
        if (answer === "n" || answer === "no") return false;
        console.log("Enter y or n.");
      }
    },
    async select<T extends string>(question: string, choices: readonly { value: T; label: string }[]) {
      console.log(`\n${question}`);
      choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice.label}`));
      while (true) {
        const answer = await ask("Choose a number", "1");
        const choice = choices.find((item, index) => answer === String(index + 1) || answer === item.value);
        if (choice) return choice.value;
        console.log(`Enter a number from 1 to ${choices.length}.`);
      }
    },
  };
}
