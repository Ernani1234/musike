import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { inflateRaw } from "node:zlib";

const inflate = promisify(inflateRaw);

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const ZIP64_EXTRA = 0x0001;
const MAX32 = 0xffffffff;

/**
 * Extracts a zip archive into `outDir`. Linux needs this: its tar (GNU) can't read zip files, and unzip isn't
 * installed everywhere. Covers what the tool downloads use (stored and deflated entries, zip64 sizes); the
 * whole archive is read into memory, which is fine for a few tens of megabytes.
 */
export async function unzip(file: string, outDir: string): Promise<void> {
  const zip = await readFile(file);
  const root = path.resolve(outDir);

  // The end-of-central-directory record sits in the last 22 bytes, plus a comment of up to 64 KB.
  let eocd = zip.length - 22;
  const stop = Math.max(0, zip.length - 22 - 0xffff);
  while (eocd >= stop && zip.readUInt32LE(eocd) !== EOCD) eocd--;
  if (eocd < stop) throw new Error("Not a zip file");
  const entries = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);

  for (let i = 0; i < entries; i++) {
    if (zip.readUInt32LE(p) !== CENTRAL) throw new Error("Damaged zip file");
    const method = zip.readUInt16LE(p + 10);
    let compressed = zip.readUInt32LE(p + 20);
    let size = zip.readUInt32LE(p + 24);
    const nameLength = zip.readUInt16LE(p + 28);
    const extraLength = zip.readUInt16LE(p + 30);
    const commentLength = zip.readUInt16LE(p + 32);
    let offset = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLength);

    // Sizes too big for 32 bits live in the zip64 extra field, in this order, only when needed.
    let extra = p + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = zip.readUInt16LE(extra);
      const length = zip.readUInt16LE(extra + 2);
      if (id === ZIP64_EXTRA) {
        let field = extra + 4;
        const next = () => {
          const value = Number(zip.readBigUInt64LE(field));
          field += 8;
          return value;
        };
        if (size === MAX32) size = next();
        if (compressed === MAX32) compressed = next();
        if (offset === MAX32) offset = next();
      }
      extra += 4 + length;
    }
    p = extraEnd + commentLength;

    const target = path.resolve(root, name);
    if (!target.startsWith(root + path.sep)) throw new Error(`Unsafe path in zip: ${name}`);
    if (name.endsWith("/")) {
      await mkdir(target, { recursive: true });
      continue;
    }

    if (zip.readUInt32LE(offset) !== LOCAL) throw new Error("Damaged zip file");
    const start = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
    const data = zip.subarray(start, start + compressed);
    let content: Buffer;
    if (method === 0) content = data;
    else if (method === 8) content = await inflate(data);
    else throw new Error(`Unsupported zip compression (${method})`);
    if (content.length !== size) throw new Error(`Damaged zip entry: ${name}`);

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}
