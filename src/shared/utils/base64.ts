/** Bytes of a standard base64 string (no line breaks), for writing files restored or imported as text. */
export function decodeBase64(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const output = new Uint8Array((value.length / 4) * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0));
  let offset = 0;
  for (let index = 0; index < value.length; index += 4) {
    const block = (alphabet.indexOf(value[index]) << 18)
      | (alphabet.indexOf(value[index + 1]) << 12)
      | (Math.max(0, alphabet.indexOf(value[index + 2])) << 6)
      | Math.max(0, alphabet.indexOf(value[index + 3]));
    if (offset < output.length) output[offset++] = (block >> 16) & 255;
    if (offset < output.length) output[offset++] = (block >> 8) & 255;
    if (offset < output.length) output[offset++] = block & 255;
  }
  return output;
}

/**
 * A short fingerprint of a long text (cyrb53 hash plus length): the same imported image always gets the
 * same key, so importing a file again does not add its images twice.
 */
export function fingerprint(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}-${value.length}`;
}
