import { MethodNotImplementedError } from "../errors.ts";
import { PDFContext } from "../PDFContext.ts";

export class PDFObject {
  clone(_context?: PDFContext): PDFObject {
    throw new MethodNotImplementedError(this.constructor.name, "clone");
  }

  toString(): string {
    throw new MethodNotImplementedError(this.constructor.name, "toString");
  }

  sizeInBytes(): number {
    throw new MethodNotImplementedError(this.constructor.name, "sizeInBytes");
  }

  copyBytesInto(_buffer: Uint8Array, _offset: number): number {
    throw new MethodNotImplementedError(this.constructor.name, "copyBytesInto");
  }
}
