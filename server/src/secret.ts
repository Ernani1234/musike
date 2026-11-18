import { randomBytes, createHash, createHmac, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function instanceSecret(dir: string, configured = process.env.MUSIKE_SECRET): Promise<string> {
  if (configured) { if (configured.length < 32) throw new Error("MUSIKE_SECRET must contain at least 32 characters"); return configured; }
  await mkdir(dir, { recursive: true }); const file = path.join(dir, "instance-secret");
  try { await writeFile(file, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 }); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
  const key = await readFile(file, "utf8"); if (key.length < 32) throw new Error("Invalid instance secret file"); return key;
}
export function secretBox(secret: string) {
  const key = createHash("sha256").update(secret).digest();
  return {
    hash: (value: string) => createHmac("sha256", key).update(value).digest("hex"),
    seal(value: string, context: string) { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(context)); const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64"); },
    open(value: string, context: string) { const bytes = Buffer.from(value, "base64"); const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8"); },
  };
}
