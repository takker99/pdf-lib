import { PDFDict } from "../objects/PDFDict.ts";
import { PDFName } from "../objects/PDFName.ts";
import { PDFNumber } from "../objects/PDFNumber.ts";

// TODO: Also handle the `/S` and `/D` entries
export class BorderStyle {
  readonly dict: PDFDict;

  static fromDict = (dict: PDFDict): BorderStyle => new BorderStyle(dict);

  protected constructor(dict: PDFDict) {
    this.dict = dict;
  }

  W(): PDFNumber | undefined {
    const W = this.dict.lookup(PDFName.of("W"));
    if (W instanceof PDFNumber) return W;
    return undefined;
  }

  getWidth(): number | undefined {
    return this.W()?.asNumber() ?? 1;
  }

  setWidth(width: number) {
    const W = this.dict.context.obj(width);
    this.dict.set(PDFName.of("W"), W);
  }
}
