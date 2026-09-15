import type { MarkdownBlockSnapshot } from "./types";

function utf8Length(text: string) {
  let length = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    length += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return length;
}

/** Native block ranges use UTF-8 bytes; editor selections use rendered UTF-16 text. */
export function getPasteCaret(blocks: readonly MarkdownBlockSnapshot[], sourceStartByte: number, insertionPrefix: string) {
  const byteOffset = sourceStartByte + utf8Length(insertionPrefix);
  let block = blocks[0];
  for (const candidate of blocks) {
    if (candidate.sourceStartByte > byteOffset) break;
    block = candidate;
  }
  if (!block) return undefined;
  let bytes = block.sourceStartByte;
  let characters = 0;
  for (const character of block.markdown) {
    const length = utf8Length(character);
    if (bytes + length > byteOffset) break;
    bytes += length;
    characters += character.length;
  }
  // The native parser maps this source offset using the full block, including hidden syntax.
  return { block, markdownPrefix: block.markdown.slice(0, characters) };
}
