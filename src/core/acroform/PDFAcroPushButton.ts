import { PDFDict } from "../objects/PDFDict.ts";
import { PDFAcroButton } from "./PDFAcroButton.ts";
import { PDFContext } from "../PDFContext.ts";
import { PDFRef } from "../objects/PDFRef.ts";
import { AcroButtonFlags } from "./flags.ts";

export class PDFAcroPushButton extends PDFAcroButton {
  static fromDict = (dict: PDFDict, ref: PDFRef) =>
    new PDFAcroPushButton(dict, ref);

  static create = (context: PDFContext) => {
    const dict = context.obj({
      FT: "Btn",
      Ff: AcroButtonFlags.PushButton,
      Kids: [],
    });
    const ref = context.register(dict);
    return new PDFAcroPushButton(dict, ref);
  };
}
