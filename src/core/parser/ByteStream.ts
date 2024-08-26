import { NextByteAssertionError } from "../errors.ts";
import { PDFRawStream } from "../objects/PDFRawStream.ts";
import { decodePDFRawStream } from "../streams/decode.ts";
import { CharCodes } from "../syntax/CharCodes.ts";

// TODO: See how line/col tracking affects performance
export class ByteStream {
  static fromPDFRawStream = (rawStream: PDFRawStream) =>
    new ByteStream(decodePDFRawStream(rawStream).decode());

  private readonly length: number;
  private idx = 0;
  private line = 0;
  private column = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.length = this.bytes.length;
  }

  moveTo(offset: number): void {
    this.idx = offset;
  }

  next(): number {
    const byte = this.bytes[this.idx++];
    if (byte === CharCodes.Newline) {
      this.line += 1;
      this.column = 0;
    } else {
      this.column += 1;
    }
    return byte;
  }

  assertNext(expected: number): number {
    if (this.peek() !== expected) {
      throw new NextByteAssertionError(this.position(), expected, this.peek());
    }
    return this.next();
  }

  peek(): number {
    return this.bytes[this.idx];
  }

  peekAhead(steps: number) {
    return this.bytes[this.idx + steps];
  }

  peekAt(offset: number) {
    return this.bytes[offset];
  }

  done(): boolean {
    return this.idx >= this.length;
  }

  offset(): number {
    return this.idx;
  }

  slice(start: number, end: number): Uint8Array {
    return this.bytes.slice(start, end);
  }

  position(): { line: number; column: number; offset: number } {
    return { line: this.line, column: this.column, offset: this.idx };
  }
}
