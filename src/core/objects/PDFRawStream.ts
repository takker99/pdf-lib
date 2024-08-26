import { PDFDict } from "./PDFDict.ts";
import { PDFStream } from "./PDFStream.ts";
import { PDFContext } from "../PDFContext.ts";
import { arrayAsString } from "../../utils/mod.ts";

export class PDFRawStream extends PDFStream {
  constructor(dict: PDFDict, public readonly contents: Uint8Array) {
    super(dict);
  }

  asUint8Array(): Uint8Array {
    return this.contents.slice();
  }

  clone(context?: PDFContext): PDFRawStream {
    return new PDFRawStream(this.dict.clone(context), this.contents.slice());
  }

  getContentsString(): string {
    return arrayAsString(this.contents);
  }

  getContents(): Uint8Array {
    return this.contents;
  }

  getContentsSize(): number {
    return this.contents.length;
  }
}
