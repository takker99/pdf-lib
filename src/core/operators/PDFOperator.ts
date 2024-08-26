import { PDFArray } from "../objects/PDFArray.ts";
import { PDFHexString } from "../objects/PDFHexString.ts";
import { PDFName } from "../objects/PDFName.ts";
import { PDFNumber } from "../objects/PDFNumber.ts";
import { PDFObject } from "../objects/PDFObject.ts";
import { PDFString } from "../objects/PDFString.ts";
import { PDFOperatorNames } from "./PDFOperatorNames.ts";
import { PDFContext } from "../PDFContext.ts";
import { CharCodes } from "../syntax/CharCodes.ts";
import { copyStringIntoBuffer } from "../../utils/mod.ts";
import { isString } from "@core/unknownutil";

export type PDFOperatorArg =
  | string
  | PDFName
  | PDFArray
  | PDFNumber
  | PDFString
  | PDFHexString;

export class PDFOperator implements PDFObject {
  static of = (name: PDFOperatorNames, args?: PDFOperatorArg[]) =>
    new PDFOperator(name, args);

  constructor(
    private readonly name: PDFOperatorNames,
    private readonly args: PDFOperatorArg[] = [],
  ) {}

  clone(context?: PDFContext): PDFOperator {
    const args = this.args.map((arg) =>
      isString(arg) ? arg : arg.clone(context)
    );
    return new PDFOperator(this.name, args);
  }

  toString(): string {
    return [...this.args.map((arg) => `${arg}`), this.name].join(" ");
  }

  sizeInBytes(): number {
    let size = 0;
    for (let idx = 0, len = this.args.length; idx < len; idx++) {
      const arg = this.args[idx];
      size += (isString(arg) ? arg.length : arg.sizeInBytes()) + 1;
    }
    size += this.name.length;
    return size;
  }

  copyBytesInto(buffer: Uint8Array, offset: number): number {
    const initialOffset = offset;

    for (let idx = 0, len = this.args.length; idx < len; idx++) {
      const arg = this.args[idx];
      if (isString(arg)) {
        offset += copyStringIntoBuffer(arg, buffer, offset);
      } else {
        offset += arg.copyBytesInto(buffer, offset);
      }
      buffer[offset++] = CharCodes.Space;
    }

    offset += copyStringIntoBuffer(this.name, buffer, offset);

    return offset - initialOffset;
  }
}
