import { PrivateConstructorError } from "../errors.ts";
import { PDFObject } from "./PDFObject.ts";
import { CharCodes } from "../syntax/CharCodes.ts";

const ENFORCER = {};

export class PDFBool implements PDFObject {
  static readonly True = new PDFBool(ENFORCER, true);
  static readonly False = new PDFBool(ENFORCER, false);

  private readonly value: boolean;

  private constructor(enforcer: any, value: boolean) {
    if (enforcer !== ENFORCER) throw new PrivateConstructorError("PDFBool");
    this.value = value;
  }

  asBoolean(): boolean {
    return this.value;
  }

  clone(): PDFBool {
    return this;
  }

  toString(): string {
    return String(this.value);
  }

  sizeInBytes(): number {
    return this.value ? 4 : 5;
  }

  copyBytesInto(buffer: Uint8Array, offset: number): number {
    if (this.value) {
      buffer[offset++] = CharCodes.t;
      buffer[offset++] = CharCodes.r;
      buffer[offset++] = CharCodes.u;
      buffer[offset++] = CharCodes.e;
      return 4;
    } else {
      buffer[offset++] = CharCodes.f;
      buffer[offset++] = CharCodes.a;
      buffer[offset++] = CharCodes.l;
      buffer[offset++] = CharCodes.s;
      buffer[offset++] = CharCodes.e;
      return 5;
    }
  }
}
