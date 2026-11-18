import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { unzip } from "../src/unzip.js";

function archive(name: string, text: string, method: number): Buffer {
  const filename = Buffer.from(name);
  const content = Buffer.from(text);
  const data = method === 8 ? deflateRawSync(content) : content;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(filename.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12);
  end.writeUInt32LE(local.length + filename.length + data.length, 16);
  return Buffer.concat([local, filename, data, central, filename, end]);
}

test("tool ZIP extraction supports stored and deflated entries and rejects traversal", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-unzip-"));
  try {
    const file = path.join(dir, "tool.zip");
    for (const method of [0, 8]) {
      await writeFile(file, archive("bin/tool", "test binary".repeat(10_000), method));
      const out = path.join(dir, `out-${method}`);
      await unzip(file, out);
      assert.equal(await readFile(path.join(out, "bin/tool"), "utf8"), "test binary".repeat(10_000));
    }
    await writeFile(file, archive("../outside", "bad", 8));
    await assert.rejects(unzip(file, path.join(dir, "out")), /Unsafe path/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
