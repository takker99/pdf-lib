import { ReparseError } from "../errors.ts";
import { PDFName } from "../objects/PDFName.ts";
import { PDFNumber } from "../objects/PDFNumber.ts";
import { PDFRawStream } from "../objects/PDFRawStream.ts";
import { PDFRef } from "../objects/PDFRef.ts";
import { ByteStream } from "./ByteStream.ts";
import { waitForTick } from "../../utils/mod.ts";
import {
  parseObject,
  parseRawInt,
  skipWhitespaceAndComments,
} from "./BaseParser.ts";
import { PDFContext } from "../PDFContext.ts";

export class PDFObjectStreamParser {
  static forStream = (
    rawStream: PDFRawStream,
    shouldWaitForTick?: () => boolean,
  ) => new PDFObjectStreamParser(rawStream, shouldWaitForTick);

  private alreadyParsed = false;
  private readonly firstOffset: number;
  private readonly objectCount: number;

  private readonly bytes: ByteStream;
  private readonly context: PDFContext;
  private readonly capNumbers = false;

  constructor(
    rawStream: PDFRawStream,
    private readonly shouldWaitForTick: () => boolean = () => false,
  ) {
    this.bytes = ByteStream.fromPDFRawStream(rawStream);
    this.context = rawStream.dict.context;

    const { dict } = rawStream;

    this.firstOffset = dict.lookup(PDFName.of("First"), PDFNumber).asNumber();
    this.objectCount = dict.lookup(PDFName.of("N"), PDFNumber).asNumber();
  }

  async parseIntoContext(): Promise<void> {
    if (this.alreadyParsed) {
      throw new ReparseError("PDFObjectStreamParser", "parseIntoContext");
    }
    this.alreadyParsed = true;

    const offsetsAndObjectNumbers = this.parseOffsetsAndObjectNumbers();
    for (let idx = 0, len = offsetsAndObjectNumbers.length; idx < len; idx++) {
      const { objectNumber, offset } = offsetsAndObjectNumbers[idx];
      this.bytes.moveTo(this.firstOffset + offset);
      const object = parseObject(this.bytes, this.context, this.capNumbers);
      const ref = PDFRef.of(objectNumber, 0);
      this.context.assign(ref, object);
      if (this.shouldWaitForTick()) await waitForTick();
    }
  }

  private parseOffsetsAndObjectNumbers(): {
    objectNumber: number;
    offset: number;
  }[] {
    const offsetsAndObjectNumbers: {
      objectNumber: number;
      offset: number;
    }[] = [];
    for (let idx = 0, len = this.objectCount; idx < len; idx++) {
      skipWhitespaceAndComments(this.bytes);
      const objectNumber = parseRawInt(this.bytes);

      skipWhitespaceAndComments(this.bytes);
      const offset = parseRawInt(this.bytes);

      offsetsAndObjectNumbers.push({ objectNumber, offset });
    }
    return offsetsAndObjectNumbers;
  }
}
