import { copyStringIntoBuffer, numberToString } from "../../utils/mod.ts";

import { PDFObject } from "./PDFObject.ts";

export class PDFNumber implements PDFObject {
  static of = (value: number) => new PDFNumber(value);

  private readonly stringValue: string;

  constructor(private readonly numberValue: number) {
    this.stringValue = numberToString(numberValue);
  }

  asNumber(): number {
    return this.numberValue;
  }

  /** @deprecated in favor of [[PDFNumber.asNumber]] */
  value(): number {
    return this.numberValue;
  }

  clone(): PDFNumber {
    return PDFNumber.of(this.numberValue);
  }

  toString(): string {
    return this.stringValue;
  }

  sizeInBytes(): number {
    return this.stringValue.length;
  }

  copyBytesInto(buffer: Uint8Array, offset: number): number {
    offset += copyStringIntoBuffer(this.stringValue, buffer, offset);
    return this.stringValue.length;
  }
}
