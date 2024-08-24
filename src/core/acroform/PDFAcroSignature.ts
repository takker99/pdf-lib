import { PDFDict } from "../objects/PDFDict.ts";
import { PDFRef } from "../objects/PDFRef.ts";
import { PDFAcroTerminal } from "./PDFAcroTerminal.ts";

export class PDFAcroSignature extends PDFAcroTerminal {
  static fromDict = (dict: PDFDict, ref: PDFRef) =>
    new PDFAcroSignature(dict, ref);
}
