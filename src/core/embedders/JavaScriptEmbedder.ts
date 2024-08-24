import { PDFHexString } from "../objects/PDFHexString.ts";
import { PDFContext } from "../PDFContext.ts";
import { PDFRef } from "../objects/PDFRef.ts";

export class JavaScriptEmbedder {
  static for(script: string, scriptName: string) {
    return new JavaScriptEmbedder(script, scriptName);
  }

  private readonly script: string;
  readonly scriptName: string;

  private constructor(script: string, scriptName: string) {
    this.script = script;
    this.scriptName = scriptName;
  }

  embedIntoContext(context: PDFContext, ref?: PDFRef): Promise<PDFRef> {
    const jsActionDict = context.obj({
      Type: "Action",
      S: "JavaScript",
      JS: PDFHexString.fromText(this.script),
    });

    if (ref) {
      context.assign(ref, jsActionDict);
      return Promise.resolve(ref);
    } else {
      return Promise.resolve(context.register(jsActionDict));
    }
  }
}
