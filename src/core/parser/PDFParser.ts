import { StalledParserError } from "../errors.ts";
import { PDFRef } from "../objects/PDFRef.ts";
import { ByteStream } from "./ByteStream.ts";
import { PDFContext } from "../PDFContext.ts";
import {
  maybeRecoverRoot,
  parseDocumentSection,
  parseHeader,
} from "./BaseParser.ts";

export const parseDocument = async (
  pdfBytes: Uint8Array,
  objectsPerTick: number = Infinity,
  throwOnInvalidObject = false,
  capNumbers = false,
): Promise<PDFContext> => {
  const bytes = new ByteStream(pdfBytes);

  let parsedObjects = 0;
  const context = new PDFContext();

  context.header = parseHeader(bytes);

  const shouldWaitForTick = () => {
    parsedObjects += 1;
    return parsedObjects % objectsPerTick === 0;
  };

  let prevOffset;
  while (!bytes.done()) {
    await parseDocumentSection(
      bytes,
      context,
      capNumbers,
      shouldWaitForTick,
      throwOnInvalidObject,
    );
    const offset = bytes.offset();
    if (offset === prevOffset) {
      throw new StalledParserError(bytes.position());
    }
    prevOffset = offset;
  }

  maybeRecoverRoot(context);

  if (context.lookup(PDFRef.of(0))) {
    console.warn("Removing parsed object: 0 0 R");
    context.delete(PDFRef.of(0));
  }

  return context;
};
