import { PDFDict } from "../objects/PDFDict.ts";
import { PDFRef } from "../objects/PDFRef.ts";
import { PDFName } from "../objects/PDFName.ts";
import { PDFContext } from "../PDFContext.ts";
import { PDFAcroField } from "./PDFAcroField.ts";

export class PDFAcroNonTerminal extends PDFAcroField {
  static fromDict = (dict: PDFDict, ref: PDFRef) =>
    new PDFAcroNonTerminal(dict, ref);

  static create = (context: PDFContext) => {
    const dict = context.obj({});
    const ref = context.register(dict);
    return new PDFAcroNonTerminal(dict, ref);
  };

  addField(field: PDFRef) {
    const { Kids } = this.normalizedEntries();
    Kids?.push(field);
  }

  normalizedEntries() {
    const Kids = this.Kids();
    if (Kids) return { Kids };

    const Kids2 = this.dict.context.obj([]);
    this.dict.set(PDFName.of("Kids"), Kids2);

    return { Kids: Kids2 };
  }
}
