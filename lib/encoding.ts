/**
 * Decode a CSV / text buffer.
 * Order: BOM (UTF-8 / UTF-16LE / UTF-16BE) → UTF-8 (reject on fatal) → Windows-1252.
 */

export type DecodedText = { text: string; encoding: "utf-8" | "utf-16le" | "utf-16be" | "windows-1252" };

function hasUtf8Bom(buf: Buffer) {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}
function hasUtf16LeBom(buf: Buffer) {
  return buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe;
}
function hasUtf16BeBom(buf: Buffer) {
  return buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff;
}

/** Heuristic for UTF-16 without BOM: lots of zero bytes in even or odd positions. */
function looksLikeUtf16(buf: Buffer): "utf-16le" | "utf-16be" | null {
  if (buf.length < 8) return null;
  const n = Math.min(buf.length, 400);
  let even0 = 0, odd0 = 0;
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) {
      if (i % 2 === 0) even0++;
      else odd0++;
    }
  }
  const half = n / 2;
  if (odd0 > half * 0.3 && even0 < half * 0.05) return "utf-16le";
  if (even0 > half * 0.3 && odd0 < half * 0.05) return "utf-16be";
  return null;
}

export function decodeTextBuffer(buf: Buffer): DecodedText {
  if (hasUtf8Bom(buf)) {
    return { text: buf.slice(3).toString("utf8"), encoding: "utf-8" };
  }
  if (hasUtf16LeBom(buf)) {
    return { text: buf.slice(2).toString("utf16le"), encoding: "utf-16le" };
  }
  if (hasUtf16BeBom(buf)) {
    // Node has no utf16be; swap bytes then decode as le
    const swapped = Buffer.alloc(buf.length - 2);
    for (let i = 2; i + 1 < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1];
      swapped[i - 1] = buf[i];
    }
    return { text: swapped.toString("utf16le"), encoding: "utf-16be" };
  }

  const utf16 = looksLikeUtf16(buf);
  if (utf16 === "utf-16le") return { text: buf.toString("utf16le"), encoding: "utf-16le" };
  if (utf16 === "utf-16be") {
    const swapped = Buffer.alloc(buf.length - (buf.length % 2));
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      swapped[i] = buf[i + 1];
      swapped[i + 1] = buf[i];
    }
    return { text: swapped.toString("utf16le"), encoding: "utf-16be" };
  }

  // UTF-8 with fatal rejection of invalid sequences
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return { text, encoding: "utf-8" };
  } catch {
    // Windows-1252 covers Latin-1 Amazon EU exports (ä ö ü € etc.)
    const text = new TextDecoder("windows-1252").decode(buf);
    return { text, encoding: "windows-1252" };
  }
}
