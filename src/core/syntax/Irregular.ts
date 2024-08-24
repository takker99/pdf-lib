import CharCodes from "./CharCodes.ts";
import { IsDelimiter } from "./Delimiters.ts";
import { IsWhitespace } from "./Whitespace.ts";

export const IsIrregular = new Uint8Array(256);

for (let idx = 0, len = 256; idx < len; idx++) {
  IsIrregular[idx] = IsWhitespace[idx] || IsDelimiter[idx] ? 1 : 0;
}
IsIrregular[CharCodes.Hash] = 1;
