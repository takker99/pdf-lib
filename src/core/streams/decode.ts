import {
  UnexpectedObjectTypeError,
  UnsupportedEncodingError,
} from "../errors.ts";
import PDFArray from "../objects/PDFArray.ts";
import PDFDict from "../objects/PDFDict.ts";
import PDFName from "../objects/PDFName.ts";
import PDFNull from "../objects/PDFNull.ts";
import PDFNumber from "../objects/PDFNumber.ts";
import PDFRawStream from "../objects/PDFRawStream.ts";
import Ascii85Stream from "./Ascii85Stream.ts";
import AsciiHexStream from "./AsciiHexStream.ts";
import FlateStream from "./FlateStream.ts";
import LZWStream from "./LZWStream.ts";
import RunLengthStream from "./RunLengthStream.ts";
import Stream, { StreamType } from "./Stream.ts";

const decodeStream = (
  stream: StreamType,
  encoding: PDFName,
  params: undefined | typeof PDFNull | PDFDict,
) => {
  if (encoding === PDFName.of("FlateDecode")) {
    return new FlateStream(stream);
  }
  if (encoding === PDFName.of("LZWDecode")) {
    let earlyChange = 1;
    if (params instanceof PDFDict) {
      const EarlyChange = params.lookup(PDFName.of("EarlyChange"));
      if (EarlyChange instanceof PDFNumber) {
        earlyChange = EarlyChange.asNumber();
      }
    }
    return new LZWStream(stream, undefined, earlyChange as 0 | 1);
  }
  if (encoding === PDFName.of("ASCII85Decode")) {
    return new Ascii85Stream(stream);
  }
  if (encoding === PDFName.of("ASCIIHexDecode")) {
    return new AsciiHexStream(stream);
  }
  if (encoding === PDFName.of("RunLengthDecode")) {
    return new RunLengthStream(stream);
  }
  throw new UnsupportedEncodingError(encoding.asString());
};

export const decodePDFRawStream = ({ dict, contents }: PDFRawStream) => {
  let stream: StreamType = new Stream(contents);

  const Filter = dict.lookup(PDFName.of("Filter"));
  const DecodeParms = dict.lookup(PDFName.of("DecodeParms"));

  if (Filter instanceof PDFName) {
    stream = decodeStream(
      stream,
      Filter,
      DecodeParms as PDFDict | typeof PDFNull | undefined,
    );
  } else if (Filter instanceof PDFArray) {
    for (let idx = 0, len = Filter.size(); idx < len; idx++) {
      stream = decodeStream(
        stream,
        Filter.lookup(idx, PDFName),
        DecodeParms && (DecodeParms as PDFArray).lookupMaybe(idx, PDFDict),
      );
    }
  } else if (Filter) {
    throw new UnexpectedObjectTypeError([PDFName, PDFArray], Filter);
  }

  return stream;
};
