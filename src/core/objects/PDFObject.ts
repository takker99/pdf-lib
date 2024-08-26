import { PDFContext } from "../PDFContext.ts";

/**
 * Represents a PDF object.
 */
export interface PDFObject {
  /** clone the object.
   *
   * @param context
   */
  clone(context?: PDFContext): PDFObject;

  /** Get the string representation of the object's contents.  */
  toString(): string;

  sizeInBytes(): number;

  copyBytesInto(buffer: Uint8Array, offset: number): number;
}
