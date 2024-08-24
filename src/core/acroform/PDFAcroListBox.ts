import { PDFDict } from "../objects/PDFDict.ts";
import { PDFAcroChoice } from "./PDFAcroChoice.ts";
import { PDFContext } from "../PDFContext.ts";
import { PDFRef } from "../objects/PDFRef.ts";

export class PDFAcroListBox extends PDFAcroChoice {
  static fromDict = (dict: PDFDict, ref: PDFRef) =>
    new PDFAcroListBox(dict, ref);

  static create = (context: PDFContext) => {
    const dict = context.obj({
      FT: "Ch",
      Kids: [],
    });
    const ref = context.register(dict);
    return new PDFAcroListBox(dict, ref);
  };
}
