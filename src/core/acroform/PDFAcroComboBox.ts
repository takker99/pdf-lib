import { PDFDict } from "../objects/PDFDict.ts";
import { PDFAcroChoice } from "./PDFAcroChoice.ts";
import { PDFContext } from "../PDFContext.ts";
import { PDFRef } from "../objects/PDFRef.ts";
import { AcroChoiceFlags } from "./flags.ts";

export class PDFAcroComboBox extends PDFAcroChoice {
  static fromDict = (dict: PDFDict, ref: PDFRef) =>
    new PDFAcroComboBox(dict, ref);

  static create = (context: PDFContext) => {
    const dict = context.obj({
      FT: "Ch",
      Ff: AcroChoiceFlags.Combo,
      Kids: [],
    });
    const ref = context.register(dict);
    return new PDFAcroComboBox(dict, ref);
  };
}
