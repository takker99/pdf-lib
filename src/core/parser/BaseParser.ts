import {
  MissingKeywordError,
  MissingPDFHeaderError,
  NumberParsingError,
  PDFInvalidObjectParsingError,
  PDFObjectParsingError,
  PDFStreamParsingError,
  Position,
  UnbalancedParenthesisError,
} from "../errors.ts";
import { ByteStream } from "./ByteStream.ts";
import { PDFObjectStreamParser } from "./PDFObjectStreamParser.ts";
import { PDFXRefStreamParser } from "./PDFXRefStreamParser.ts";
import { PDFContext } from "../PDFContext.ts";
import { charFromCode, waitForTick } from "../../utils/mod.ts";
import { PDFHeader } from "../document/PDFHeader.ts";
import { PDFTrailer } from "../document/PDFTrailer.ts";
import { PDFCrossRefSection } from "../document/PDFCrossRefSection.ts";
import { PDFHexString } from "../objects/PDFHexString.ts";
import { PDFString } from "../objects/PDFString.ts";
import { PDFName } from "../objects/PDFName.ts";
import { PDFArray } from "../objects/PDFArray.ts";
import { PDFRef } from "../objects/PDFRef.ts";
import { PDFNumber } from "../objects/PDFNumber.ts";
import { PDFObject } from "../objects/PDFObject.ts";
import { PDFBool } from "../objects/PDFBool.ts";
import { PDFNull } from "../objects/PDFNull.ts";
import { DictMap, PDFDict } from "../objects/PDFDict.ts";
import { PDFStream } from "../objects/PDFStream.ts";
import { PDFRawStream } from "../objects/PDFRawStream.ts";
import { PDFInvalidObject } from "../objects/PDFInvalidObject.ts";
import { PDFCatalog } from "../structures/PDFCatalog.ts";
import { PDFPageTree } from "../structures/PDFPageTree.ts";
import { PDFPageLeaf } from "../structures/PDFPageLeaf.ts";
import { CharCodes } from "../syntax/CharCodes.ts";
import { IsDigit, IsNumeric } from "../syntax/Numeric.ts";
import { IsDelimiter } from "../syntax/Delimiters.ts";
import { IsWhitespace } from "../syntax/Whitespace.ts";
import { Keywords } from "../syntax/Keywords.ts";

const { Newline, CarriageReturn } = CharCodes;

/** TODO: Throw error if eof is reached before finishing object parse... @module */

export const parseRawInt = (bytes: ByteStream): number => {
  let value = "";

  while (!bytes.done()) {
    const byte = bytes.peek();
    if (!IsDigit[byte]) break;
    value += charFromCode(bytes.next());
  }

  const numberValue = Number(value);

  if (!value || !isFinite(numberValue)) {
    throw new NumberParsingError(bytes.position(), value);
  }

  return numberValue;
};

// TODO: Maybe handle exponential format?
// TODO: Compare performance of string concatenation to charFromCode(...bytes)
const parseRawNumber = (
  bytes: ByteStream,
  capNumbers = false,
): number => {
  let value = "";

  // Parse integer-part, the leading (+ | - | . | 0-9)
  while (!bytes.done()) {
    const byte = bytes.peek();
    if (!IsNumeric[byte]) break;
    value += charFromCode(bytes.next());
    if (byte === CharCodes.Period) break;
  }

  // Parse decimal-part, the trailing (0-9)
  while (!bytes.done()) {
    const byte = bytes.peek();
    if (!IsDigit[byte]) break;
    value += charFromCode(bytes.next());
  }

  const numberValue = Number(value);

  if (!value || !isFinite(numberValue)) {
    throw new NumberParsingError(bytes.position(), value);
  }

  if (numberValue > Number.MAX_SAFE_INTEGER) {
    if (capNumbers) {
      const msg =
        `Parsed number that is too large for some PDF readers: ${value}, using Number.MAX_SAFE_INTEGER instead.`;
      console.warn(msg);
      return Number.MAX_SAFE_INTEGER;
    } else {
      const msg =
        `Parsed number that is too large for some PDF readers: ${value}, not capping.`;
      console.warn(msg);
    }
  }

  return numberValue;
};

const parseNumberOrRef = (
  bytes: ByteStream,
  capNumbers?: boolean,
): PDFNumber | PDFRef => {
  const firstNum = parseRawNumber(bytes, capNumbers);
  skipWhitespaceAndComments(bytes);

  const lookaheadStart = bytes.offset();
  if (IsDigit[bytes.peek()]) {
    const secondNum = parseRawNumber(bytes, capNumbers);
    skipWhitespaceAndComments(bytes);
    if (bytes.peek() === CharCodes.R) {
      bytes.assertNext(CharCodes.R);
      return PDFRef.of(firstNum, secondNum);
    }
  }

  bytes.moveTo(lookaheadStart);
  return new PDFNumber(firstNum);
};

// TODO: Maybe update PDFHexString.of() logic to remove whitespace and validate input?
const parseHexString = (bytes: ByteStream): PDFHexString => {
  let value = "";

  bytes.assertNext(CharCodes.LessThan);
  while (!bytes.done() && bytes.peek() !== CharCodes.GreaterThan) {
    value += charFromCode(bytes.next());
  }
  bytes.assertNext(CharCodes.GreaterThan);

  return PDFHexString.of(value);
};

const parseString = (bytes: ByteStream): PDFString => {
  let nestingLvl = 0;
  let isEscaped = false;
  let value = "";

  while (!bytes.done()) {
    const byte = bytes.next();
    value += charFromCode(byte);

    // Check for unescaped parenthesis
    if (!isEscaped) {
      if (byte === CharCodes.LeftParen) nestingLvl += 1;
      if (byte === CharCodes.RightParen) nestingLvl -= 1;
    }

    // Track whether current character is being escaped or not
    if (byte === CharCodes.BackSlash) {
      isEscaped = !isEscaped;
    } else if (isEscaped) {
      isEscaped = false;
    }

    // Once (if) the unescaped parenthesis balance out, return their contents
    if (nestingLvl === 0) {
      // Remove the outer parens so they aren't part of the contents
      return new PDFString(value.substring(1, value.length - 1));
    }
  }

  throw new UnbalancedParenthesisError(bytes.position());
};

// TODO: Compare performance of string concatenation to charFromCode(...bytes)
// TODO: Maybe preallocate small Uint8Array if can use charFromCode?
const parseName = (bytes: ByteStream): PDFName => {
  bytes.assertNext(CharCodes.ForwardSlash);

  let name = "";
  while (!bytes.done()) {
    const byte = bytes.peek();
    if (IsWhitespace[byte] || IsDelimiter[byte]) break;
    name += charFromCode(byte);
    bytes.next();
  }

  return PDFName.of(name);
};

export const skipWhitespace = (bytes: ByteStream): void => {
  while (!bytes.done() && IsWhitespace[bytes.peek()]) {
    bytes.next();
  }
};

//  const skipLine = (bytes: ByteStream): void => {
//   while (!bytes.done()) {
//     const byte = bytes.peek();
//     if (byte === Newline || byte === CarriageReturn) return;
//     bytes.next();
//   }
// };

export const skipWhitespaceAndComments = (bytes: ByteStream): void => {
  skipWhitespace(bytes);
  while (skipComment(bytes)) skipWhitespace(bytes);
};

const skipComment = (bytes: ByteStream): boolean => {
  if (bytes.peek() !== CharCodes.Percent) return false;
  while (!bytes.done()) {
    const byte = bytes.peek();
    if (byte === Newline || byte === CarriageReturn) return true;
    bytes.next();
  }
  return true;
};

const matchKeyword = (bytes: ByteStream, keyword: number[]): boolean => {
  const initialOffset = bytes.offset();
  for (let idx = 0, len = keyword.length; idx < len; idx++) {
    if (bytes.done() || bytes.next() !== keyword[idx]) {
      bytes.moveTo(initialOffset);
      return false;
    }
  }
  return true;
};

const parseArray = (
  bytes: ByteStream,
  context: PDFContext,
  capNumbers?: boolean,
): PDFArray => {
  bytes.assertNext(CharCodes.LeftSquareBracket);
  skipWhitespaceAndComments(bytes);

  const pdfArray = PDFArray.withContext(context);
  while (bytes.peek() !== CharCodes.RightSquareBracket) {
    const element = parseObject(bytes, context, capNumbers);
    pdfArray.push(element);
    skipWhitespaceAndComments(bytes);
  }
  bytes.assertNext(CharCodes.RightSquareBracket);
  return pdfArray;
};

// TODO: Is it possible to reduce duplicate parsing for ref lookaheads?
export const parseObject = (
  bytes: ByteStream,
  context: PDFContext,
  capNumbers?: boolean,
): PDFObject => {
  skipWhitespaceAndComments(bytes);

  if (matchKeyword(bytes, Keywords.true)) return PDFBool.True;
  if (matchKeyword(bytes, Keywords.false)) return PDFBool.False;
  if (matchKeyword(bytes, Keywords.null)) return new PDFNull();

  const byte = bytes.peek();

  if (
    byte === CharCodes.LessThan &&
    bytes.peekAhead(1) === CharCodes.LessThan
  ) {
    return parseDictOrStream(bytes, context, capNumbers);
  }
  if (byte === CharCodes.LessThan) return parseHexString(bytes);
  if (byte === CharCodes.LeftParen) return parseString(bytes);
  if (byte === CharCodes.ForwardSlash) return parseName(bytes);
  if (byte === CharCodes.LeftSquareBracket) return parseArray(bytes, context);
  if (IsNumeric[byte]) return parseNumberOrRef(bytes, capNumbers);

  throw new PDFObjectParsingError(bytes.position(), byte);
};

const parseDictOrStream = (
  bytes: ByteStream,
  context: PDFContext,
  capNumbers?: boolean,
): PDFDict | PDFStream => {
  const startPos = bytes.position();

  const dict = parseDict(bytes, context, capNumbers);

  skipWhitespaceAndComments(bytes);

  if (
    !matchKeyword(bytes, Keywords.streamEOF1) &&
    !matchKeyword(bytes, Keywords.streamEOF2) &&
    !matchKeyword(bytes, Keywords.streamEOF3) &&
    !matchKeyword(bytes, Keywords.streamEOF4) &&
    !matchKeyword(bytes, Keywords.stream)
  ) {
    return dict;
  }

  const start = bytes.offset();
  let end: number;

  const Length = dict.get(PDFName.of("Length"));
  if (Length instanceof PDFNumber) {
    end = start + Length.asNumber();
    bytes.moveTo(end);
    skipWhitespaceAndComments(bytes);
    if (!matchKeyword(bytes, Keywords.endstream)) {
      bytes.moveTo(start);
      end = findEndOfStreamFallback(bytes, startPos);
    }
  } else {
    end = findEndOfStreamFallback(bytes, startPos);
  }

  const contents = bytes.slice(start, end);

  return new PDFRawStream(dict, contents);
};

export const parseDict = (
  bytes: ByteStream,
  context: PDFContext,
  capNumbers?: boolean,
): PDFDict => {
  bytes.assertNext(CharCodes.LessThan);
  bytes.assertNext(CharCodes.LessThan);
  skipWhitespaceAndComments(bytes);

  const dict: DictMap = new Map();

  while (
    !bytes.done() &&
    bytes.peek() !== CharCodes.GreaterThan &&
    bytes.peekAhead(1) !== CharCodes.GreaterThan
  ) {
    const key = parseName(bytes);
    const value = parseObject(bytes, context, capNumbers);
    dict.set(key, value);
    skipWhitespaceAndComments(bytes);
  }

  skipWhitespaceAndComments(bytes);
  bytes.assertNext(CharCodes.GreaterThan);
  bytes.assertNext(CharCodes.GreaterThan);

  const Type = dict.get(PDFName.of("Type"));

  if (Type === PDFName.of("Catalog")) {
    return PDFCatalog.fromMapWithContext(dict, context);
  } else if (Type === PDFName.of("Pages")) {
    return PDFPageTree.fromMapWithContext(dict, context);
  } else if (Type === PDFName.of("Page")) {
    return PDFPageLeaf.fromMapWithContext(dict, context);
  } else {
    return PDFDict.fromMapWithContext(dict, context);
  }
};

const findEndOfStreamFallback = (
  bytes: ByteStream,
  startPos: Position,
) => {
  // Move to end of stream, while handling nested streams
  let nestingLvl = 1;
  let end = bytes.offset();

  while (!bytes.done()) {
    end = bytes.offset();

    if (matchKeyword(bytes, Keywords.stream)) {
      nestingLvl += 1;
    } else if (
      matchKeyword(bytes, Keywords.EOF1endstream) ||
      matchKeyword(bytes, Keywords.EOF2endstream) ||
      matchKeyword(bytes, Keywords.EOF3endstream) ||
      matchKeyword(bytes, Keywords.endstream)
    ) {
      nestingLvl -= 1;
    } else {
      bytes.next();
    }

    if (nestingLvl === 0) break;
  }

  if (nestingLvl !== 0) throw new PDFStreamParsingError(startPos);

  return end;
};

export const parseIndirectObjectHeader = (bytes: ByteStream): PDFRef => {
  skipWhitespaceAndComments(bytes);
  const objectNumber = parseRawInt(bytes);

  skipWhitespaceAndComments(bytes);
  const generationNumber = parseRawInt(bytes);

  skipWhitespaceAndComments(bytes);
  if (!matchKeyword(bytes, Keywords.obj)) {
    throw new MissingKeywordError(bytes.position(), Keywords.obj);
  }

  return PDFRef.of(objectNumber, generationNumber);
};

export const matchIndirectObjectHeader = (bytes: ByteStream): boolean => {
  const initialOffset = bytes.offset();
  try {
    parseIndirectObjectHeader(bytes);
    return true;
  } catch (_) {
    bytes.moveTo(initialOffset);
    return false;
  }
};

export const parseIndirectObject = async (
  bytes: ByteStream,
  context: PDFContext,
  capNumbers: boolean,
  shouldWaitForTick: () => boolean,
): Promise<PDFRef> => {
  const ref = parseIndirectObjectHeader(bytes);

  skipWhitespaceAndComments(bytes);
  const object = parseObject(bytes, context, capNumbers);

  skipWhitespaceAndComments(bytes);
  // if (!this.matchKeyword(Keywords.endobj)) {
  // throw new MissingKeywordError(this.bytes.position(), Keywords.endobj);
  // }

  // TODO: Log a warning if this fails...
  matchKeyword(bytes, Keywords.endobj);

  if (
    object instanceof PDFRawStream &&
    object.dict.lookup(PDFName.of("Type")) === PDFName.of("ObjStm")
  ) {
    await PDFObjectStreamParser.forStream(
      object,
      shouldWaitForTick,
    ).parseIntoContext();
  } else if (
    object instanceof PDFRawStream &&
    object.dict.lookup(PDFName.of("Type")) === PDFName.of("XRef")
  ) {
    new PDFXRefStreamParser(object).parseIntoContext();
  } else {
    context.assign(ref, object);
  }

  return ref;
};

export const parseHeader = (bytes: ByteStream): PDFHeader => {
  while (!bytes.done()) {
    if (!matchKeyword(bytes, Keywords.header)) {
      bytes.next();
      continue;
    }
    const major = parseRawInt(bytes);
    bytes.assertNext(CharCodes.Period);
    const minor = parseRawInt(bytes);
    const header = new PDFHeader(major, minor);
    skipBinaryHeaderComment(bytes);
    return header;
  }

  throw new MissingPDFHeaderError(bytes.position());
};

/**
 * Skips the binary comment following a PDF header. The specification
 * defines this binary comment (section 7.5.2 File Header) as a sequence of 4
 * or more bytes that are 128 or greater, and which are preceded by a "%".
 *
 * This would imply that to strip out this binary comment, we could check for
 * a sequence of bytes starting with "%", and remove all subsequent bytes that
 * are 128 or greater. This works for many documents that properly comply with
 * the spec. But in the wild, there are PDFs that omit the leading "%", and
 * include bytes that are less than 128 (e.g. 0 or 1). So in order to parse
 * these headers correctly, we just throw out all bytes leading up to the
 * first indirect object header.
 */
const skipBinaryHeaderComment = (bytes: ByteStream): void => {
  skipWhitespaceAndComments(bytes);
  try {
    const initialOffset = bytes.offset();
    parseIndirectObjectHeader(bytes);
    bytes.moveTo(initialOffset);
  } catch (_) {
    bytes.next();
    skipWhitespaceAndComments(bytes);
  }
};

const maybeParseTrailer = (bytes: ByteStream): PDFTrailer | void => {
  skipWhitespaceAndComments(bytes);
  if (!matchKeyword(bytes, Keywords.startxref)) return;
  skipWhitespaceAndComments(bytes);

  const offset = parseRawInt(bytes);

  skipWhitespace(bytes);
  matchKeyword(bytes, Keywords.eof);
  skipWhitespaceAndComments(bytes);
  matchKeyword(bytes, Keywords.eof);
  skipWhitespaceAndComments(bytes);

  return PDFTrailer.forLastCrossRefSectionOffset(offset);
};

export const maybeRecoverRoot = (context: PDFContext): void => {
  const isValidCatalog = (obj?: PDFObject) =>
    obj instanceof PDFDict &&
    obj.lookup(PDFName.of("Type")) === PDFName.of("Catalog");

  const catalog = context.lookup(context.trailerInfo.Root);

  if (!isValidCatalog(catalog)) {
    const indirectObjects = context.enumerateIndirectObjects();
    for (let idx = 0, len = indirectObjects.length; idx < len; idx++) {
      const [ref, object] = indirectObjects[idx];
      if (isValidCatalog(object)) {
        context.trailerInfo.Root = ref;
      }
    }
  }
};

// TODO: Improve and clean this up
const tryToParseInvalidIndirectObject = (
  bytes: ByteStream,
  context: PDFContext,
  throwOnInvalidObject: boolean,
) => {
  const startPos = bytes.position();

  const msg = `Trying to parse invalid object: ${JSON.stringify(startPos)})`;
  if (throwOnInvalidObject) throw new Error(msg);
  console.warn(msg);

  const ref = parseIndirectObjectHeader(bytes);

  console.warn(`Invalid object ref: ${ref}`);

  skipWhitespaceAndComments(bytes);
  const start = bytes.offset();

  let failed = true;
  while (!bytes.done()) {
    if (matchKeyword(bytes, Keywords.endobj)) {
      failed = false;
    }
    if (!failed) break;
    bytes.next();
  }

  if (failed) throw new PDFInvalidObjectParsingError(startPos);

  const end = bytes.offset() - Keywords.endobj.length;

  const object = PDFInvalidObject.of(bytes.slice(start, end));
  context.assign(ref, object);

  return ref;
};

const maybeParseCrossRefSection = (
  bytes: ByteStream,
): PDFCrossRefSection | void => {
  skipWhitespaceAndComments(bytes);
  if (!matchKeyword(bytes, Keywords.xref)) return;
  skipWhitespaceAndComments(bytes);

  let objectNumber = -1;
  const xref = PDFCrossRefSection.createEmpty();

  while (!bytes.done() && IsDigit[bytes.peek()]) {
    const firstInt = parseRawInt(bytes);
    skipWhitespaceAndComments(bytes);

    const secondInt = parseRawInt(bytes);
    skipWhitespaceAndComments(bytes);

    const byte = bytes.peek();
    if (byte === CharCodes.n || byte === CharCodes.f) {
      const ref = PDFRef.of(objectNumber, secondInt);
      if (bytes.next() === CharCodes.n) {
        xref.addEntry(ref, firstInt);
      } else {
        // this.context.delete(ref);
        xref.addDeletedEntry(ref, firstInt);
      }
      objectNumber += 1;
    } else {
      objectNumber = firstInt;
    }
    skipWhitespaceAndComments(bytes);
  }

  return xref;
};

const maybeParseTrailerDict = (
  bytes: ByteStream,
  context: PDFContext,
  capNumbers: boolean,
): void => {
  skipWhitespaceAndComments(bytes);
  if (!matchKeyword(bytes, Keywords.trailer)) return;
  skipWhitespaceAndComments(bytes);

  const dict = parseDict(bytes, context, capNumbers);

  context.trailerInfo = {
    Root: dict.get(PDFName.of("Root")) || context.trailerInfo.Root,
    Encrypt: dict.get(PDFName.of("Encrypt")) || context.trailerInfo.Encrypt,
    Info: dict.get(PDFName.of("Info")) || context.trailerInfo.Info,
    ID: dict.get(PDFName.of("ID")) || context.trailerInfo.ID,
  };
};

/**
 * This operation is not necessary for valid PDF files. But some invalid PDFs
 * contain jibberish in between indirect objects. This method is designed to
 * skip past that jibberish, should it exist, until it reaches the next
 * indirect object header, an xref table section, or the file trailer.
 */
const skipJibberish = (bytes: ByteStream): void => {
  skipWhitespaceAndComments(bytes);
  while (!bytes.done()) {
    const initialOffset = bytes.offset();
    const byte = bytes.peek();
    const isAlphaNumeric = byte >= CharCodes.Space && byte <= CharCodes.Tilde;
    if (isAlphaNumeric) {
      if (
        matchKeyword(bytes, Keywords.xref) ||
        matchKeyword(bytes, Keywords.trailer) ||
        matchKeyword(bytes, Keywords.startxref) ||
        matchIndirectObjectHeader(bytes)
      ) {
        bytes.moveTo(initialOffset);
        break;
      }
    }
    bytes.next();
  }
};

export const parseDocumentSection = async (
  bytes: ByteStream,
  context: PDFContext,
  capNumbers: boolean,
  shouldWaitForTick: () => boolean,
  throwOnInvalidObject: boolean,
): Promise<void> => {
  await parseIndirectObjects(
    bytes,
    context,
    capNumbers,
    shouldWaitForTick,
    throwOnInvalidObject,
  );
  maybeParseCrossRefSection(bytes);
  maybeParseTrailerDict(bytes, context, capNumbers);
  maybeParseTrailer(bytes);

  // TODO: Can this be done only when needed, to avoid harming performance?
  skipJibberish(bytes);
};

const parseIndirectObjects = async (
  bytes: ByteStream,
  context: PDFContext,
  capNumbers: boolean,
  shouldWaitForTick: () => boolean,
  throwOnInvalidObject: boolean,
): Promise<void> => {
  skipWhitespaceAndComments(bytes);

  while (!bytes.done() && IsDigit[bytes.peek()]) {
    const initialOffset = bytes.offset();

    try {
      await parseIndirectObject(
        bytes,
        context,
        capNumbers,
        shouldWaitForTick,
      );
    } catch (_) {
      // TODO: Add tracing/logging mechanism to track when this happens!
      bytes.moveTo(initialOffset);
      tryToParseInvalidIndirectObject(
        bytes,
        context,
        throwOnInvalidObject,
      );
    }
    skipWhitespaceAndComments(bytes);

    // TODO: Can this be done only when needed, to avoid harming performance?
    skipJibberish(bytes);

    if (shouldWaitForTick()) await waitForTick();
  }
};
