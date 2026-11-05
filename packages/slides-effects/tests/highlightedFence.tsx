import React from "react";
import { highlightCode } from "../../presentation/src/compiler/remarkCodeHighlight";

export async function highlightedFence(source: string, language = "tsx") {
  return <pre>{React.createElement("code", { highlighted: await highlightCode(source, language), children: source + "\n" })}</pre>;
}
