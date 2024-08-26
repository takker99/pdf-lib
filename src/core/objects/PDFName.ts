import { PrivateConstructorError } from "../errors.ts";
import { PDFObject } from "./PDFObject.ts";
import { CharCodes } from "../syntax/CharCodes.ts";
import { IsIrregular } from "../syntax/Irregular.ts";
import {
  charFromHexCode,
  copyStringIntoBuffer,
  toCharCode,
  toHexString,
} from "../../utils/mod.ts";

const decodeName = (name: string) =>
  name.replace(/#([\dABCDEF]{2})/g, (_, hex) => charFromHexCode(hex));

const isRegularChar = (charCode: number) =>
  charCode >= CharCodes.ExclamationPoint &&
  charCode <= CharCodes.Tilde &&
  !IsIrregular[charCode];

const ENFORCER = {};
const pool = new Map<string, PDFName>();

const of = (name: string): PDFName => {
  const decodedValue = decodeName(name);

  let instance = pool.get(decodedValue);
  if (!instance) {
    instance = new PDFName(ENFORCER, decodedValue);
    pool.set(decodedValue, instance);
  }

  return instance;
};

export class PDFName implements PDFObject {
  /* tslint:disable member-ordering */
  static readonly Length = of("Length");
  static readonly FlateDecode = of("FlateDecode");
  static readonly Resources = of("Resources");
  static readonly Font = of("Font");
  static readonly XObject = of("XObject");
  static readonly ExtGState = of("ExtGState");
  static readonly Contents = of("Contents");
  static readonly Type = of("Type");
  static readonly Parent = of("Parent");
  static readonly MediaBox = of("MediaBox");
  static readonly Page = of("Page");
  static readonly Annots = of("Annots");
  static readonly TrimBox = of("TrimBox");
  static readonly ArtBox = of("ArtBox");
  static readonly BleedBox = of("BleedBox");
  static readonly CropBox = of("CropBox");
  static readonly Rotate = of("Rotate");
  static readonly Title = of("Title");
  static readonly Author = of("Author");
  static readonly Subject = of("Subject");
  static readonly Creator = of("Creator");
  static readonly Keywords = of("Keywords");
  static readonly Producer = of("Producer");
  static readonly CreationDate = of("CreationDate");
  static readonly ModDate = of("ModDate");
  /* tslint:enable member-ordering */

  private readonly encodedName: string;

  static of = (name: string): PDFName => of(name);

  constructor(enforcer: unknown, name: string) {
    if (enforcer !== ENFORCER) throw new PrivateConstructorError("PDFName");

    this.encodedName = `/${
      name.split("").map((character) => {
        const code = toCharCode(character);
        return isRegularChar(code) ? character : `#${toHexString(code)}`;
      }).join("")
    }`;
  }

  asBytes(): Uint8Array {
    const bytes: number[] = [];

    let hex = "";
    let escaped = false;

    const pushByte = (byte?: number) => {
      if (byte !== undefined) bytes.push(byte);
      escaped = false;
    };

    for (let idx = 1, len = this.encodedName.length; idx < len; idx++) {
      const char = this.encodedName[idx];
      const byte = toCharCode(char);
      const nextChar = this.encodedName[idx + 1];
      if (!escaped) {
        if (byte === CharCodes.Hash) escaped = true;
        else pushByte(byte);
      } else {
        if (
          (byte >= CharCodes.Zero && byte <= CharCodes.Nine) ||
          (byte >= CharCodes.a && byte <= CharCodes.f) ||
          (byte >= CharCodes.A && byte <= CharCodes.F)
        ) {
          hex += char;
          if (
            hex.length === 2 ||
            !(
              (nextChar >= "0" && nextChar <= "9") ||
              (nextChar >= "a" && nextChar <= "f") ||
              (nextChar >= "A" && nextChar <= "F")
            )
          ) {
            pushByte(parseInt(hex, 16));
            hex = "";
          }
        } else {
          pushByte(byte);
        }
      }
    }

    return new Uint8Array(bytes);
  }

  // TODO: This should probably use `utf8Decode()`
  // TODO: Polyfill Array.from?
  decodeText(): string {
    const bytes = this.asBytes();
    return String.fromCharCode(...Array.from(bytes));
  }

  asString(): string {
    return this.encodedName;
  }

  /** @deprecated in favor of [[PDFName.asString]] */
  value(): string {
    return this.encodedName;
  }

  clone(): PDFName {
    return this;
  }

  toString(): string {
    return this.encodedName;
  }

  sizeInBytes(): number {
    return this.encodedName.length;
  }

  copyBytesInto(buffer: Uint8Array, offset: number): number {
    offset += copyStringIntoBuffer(this.encodedName, buffer, offset);
    return this.encodedName.length;
  }
}
