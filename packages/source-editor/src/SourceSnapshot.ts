type Edit = { offset: number; removedLength: number; insertedText: string; revision: number };
type Piece = { text: string; start: number; end: number };

/** A derived snapshot journal, not an editable document owner. The native buffer
 * supplies ordered UTF-16 transactions. No whole-source work occurs at ingress;
 * consumers materialize only for debounced preview or an explicit save. */
export class SourceSnapshot {
  private source: string;
  private edits: Edit[] = [];
  private length: number;
  private revision = 0;
  constructor(source: string) { this.source = source; this.length = source.length; }
  apply(edit: Edit) {
    if (!Number.isSafeInteger(edit.revision) || edit.revision < 1) throw new RangeError("Invalid source snapshot revision");
    if (edit.revision <= this.revision) return false;
    if (!Number.isSafeInteger(edit.offset) || !Number.isSafeInteger(edit.removedLength)
      || edit.offset < 0 || edit.removedLength < 0 || edit.offset + edit.removedLength > this.length) {
      throw new RangeError("Invalid source snapshot transaction");
    }
    this.edits.push({ ...edit });
    this.length += edit.insertedText.length - edit.removedLength;
    this.revision = edit.revision;
    return true;
  }
  materialize() {
    if (!this.edits.length) return this.source;
    let pieces: Piece[] = [{ text: this.source, start: 0, end: this.source.length }];
    for (const edit of this.edits) {
      const next: Piece[] = [];
      let offset = 0;
      let inserted = false;
      const insert = () => {
        if (!inserted && edit.insertedText.length) next.push({ text: edit.insertedText, start: 0, end: edit.insertedText.length });
        inserted = true;
      };
      for (const piece of pieces) {
        const end = offset + piece.end - piece.start;
        if (end <= edit.offset) next.push(piece);
        else if (offset >= edit.offset + edit.removedLength) { insert(); next.push(piece); }
        else {
          if (offset < edit.offset) next.push({ ...piece, end: piece.start + edit.offset - offset });
          insert();
          if (end > edit.offset + edit.removedLength) next.push({ ...piece, start: piece.start + edit.offset + edit.removedLength - offset });
        }
        offset = end;
      }
      insert();
      pieces = next;
    }
    this.source = pieces.map((piece) => piece.text.slice(piece.start, piece.end)).join("");
    this.edits = [];
    return this.source;
  }
}
