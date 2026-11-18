/** A malformed/multipart header is ignored; false means a valid but unsatisfiable range. */
export function byteRange(header: string | undefined, size: number): { start: number; end: number } | null | false {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header) : null;
  if (!match || (!match[1] && !match[2])) return null;
  if (size === 0) return false;
  const length = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2]!);
    if (!suffix) return false;
    return { start: suffix >= length ? 0 : size - Number(suffix), end: size - 1 };
  }
  const start = BigInt(match[1]);
  const end = match[2] ? BigInt(match[2]) : length - 1n;
  if (start >= length || start > end) return false;
  return { start: Number(start), end: end >= length ? size - 1 : Number(end) };
}
