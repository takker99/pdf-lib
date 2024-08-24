import { PDFHeader } from "../document/PDFHeader.ts";
import { PDFTrailer } from "../document/PDFTrailer.ts";
import { PDFInvalidObject } from "../objects/PDFInvalidObject.ts";
import { PDFName } from "../objects/PDFName.ts";
import { PDFNumber } from "../objects/PDFNumber.ts";
import { PDFObject } from "../objects/PDFObject.ts";
import { PDFRef } from "../objects/PDFRef.ts";
import { PDFStream } from "../objects/PDFStream.ts";
import { PDFContext } from "../PDFContext.ts";
import { PDFCrossRefStream } from "../structures/PDFCrossRefStream.ts";
import { PDFObjectStream } from "../structures/PDFObjectStream.ts";
import { PDFWriter } from "./PDFWriter.ts";
import { last, waitForTick } from "../../utils/mod.ts";

export class PDFStreamWriter extends PDFWriter {
  static forContext = (
    context: PDFContext,
    objectsPerTick: number,
    encodeStreams = true,
    objectsPerStream = 50,
  ) =>
    new PDFStreamWriter(
      context,
      objectsPerTick,
      encodeStreams,
      objectsPerStream,
    );

  private readonly encodeStreams: boolean;
  private readonly objectsPerStream: number;

  private constructor(
    context: PDFContext,
    objectsPerTick: number,
    encodeStreams: boolean,
    objectsPerStream: number,
  ) {
    super(context, objectsPerTick);

    this.encodeStreams = encodeStreams;
    this.objectsPerStream = objectsPerStream;
  }

  protected async computeBufferSize() {
    let objectNumber = this.context.largestObjectNumber + 1;

    const header = PDFHeader.forVersion(1, 7);

    let size = header.sizeInBytes() + 2;

    const xrefStream = PDFCrossRefStream.create(
      this.createTrailerDict(),
      this.encodeStreams,
    );

    const uncompressedObjects: [PDFRef, PDFObject][] = [];
    const compressedObjects: [PDFRef, PDFObject][][] = [];
    const objectStreamRefs: PDFRef[] = [];

    const indirectObjects = this.context.enumerateIndirectObjects();
    for (let idx = 0, len = indirectObjects.length; idx < len; idx++) {
      const indirectObject = indirectObjects[idx];
      const [ref, object] = indirectObject;

      const shouldNotCompress = ref === this.context.trailerInfo.Encrypt ||
        object instanceof PDFStream ||
        object instanceof PDFInvalidObject ||
        ref.generationNumber !== 0;

      if (shouldNotCompress) {
        uncompressedObjects.push(indirectObject);
        xrefStream.addUncompressedEntry(ref, size);
        size += this.computeIndirectObjectSize(indirectObject);
        if (this.shouldWaitForTick(1)) await waitForTick();
      } else {
        let chunk = last(compressedObjects);
        let objectStreamRef = last(objectStreamRefs);
        if (!chunk || chunk.length % this.objectsPerStream === 0) {
          chunk = [];
          compressedObjects.push(chunk);
          objectStreamRef = PDFRef.of(objectNumber++);
          objectStreamRefs.push(objectStreamRef);
        }
        xrefStream.addCompressedEntry(ref, objectStreamRef, chunk.length);
        chunk.push(indirectObject);
      }
    }

    for (let idx = 0, len = compressedObjects.length; idx < len; idx++) {
      const chunk = compressedObjects[idx];
      const ref = objectStreamRefs[idx];

      const objectStream = PDFObjectStream.withContextAndObjects(
        this.context,
        chunk,
        this.encodeStreams,
      );

      xrefStream.addUncompressedEntry(ref, size);
      size += this.computeIndirectObjectSize([ref, objectStream]);

      uncompressedObjects.push([ref, objectStream]);

      if (this.shouldWaitForTick(chunk.length)) await waitForTick();
    }

    const xrefStreamRef = PDFRef.of(objectNumber++);
    xrefStream.dict.set(PDFName.of("Size"), PDFNumber.of(objectNumber));
    xrefStream.addUncompressedEntry(xrefStreamRef, size);
    const xrefOffset = size;
    size += this.computeIndirectObjectSize([xrefStreamRef, xrefStream]);

    uncompressedObjects.push([xrefStreamRef, xrefStream]);

    const trailer = PDFTrailer.forLastCrossRefSectionOffset(xrefOffset);
    size += trailer.sizeInBytes();

    return { size, header, indirectObjects: uncompressedObjects, trailer };
  }
}
