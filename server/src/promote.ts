import { randomUUID } from "node:crypto";
import { Accounts, phoneOf, emptyLibrary } from "./accounts.js";

export async function promote(args: string[]) {
  args = args.filter((value) => value !== "--");
  const phone = phoneOf(args[0]); const revoke = args.includes("--revoke");
  const accounts = await Accounts.open({ adminPhone: process.env.ADMIN_PHONE || phone });
  try {
    let user = await accounts.db.get("SELECT * FROM users WHERE phone=?", [phone]);
    if (!user && !revoke) {
      const id = randomUUID(); await accounts.db.batch([
        { sql: "INSERT INTO users(id,phone,created_at) VALUES(?,?,?)", params: [id, phone, Date.now()] },
        { sql: "INSERT INTO libraries(user_id,json,updated_at) VALUES(?,?,?)", params: [id, JSON.stringify(emptyLibrary()), Date.now()] },
      ]); user = { id };
    }
    if (!user) throw new Error("User not found");
    await accounts.changeUser("cli", user.id, { role: revoke ? "user" : "admin" }, "local");
    console.log(JSON.stringify({ event: "admin_action", action: revoke ? "admin.revoke" : "admin.promote", actor: "cli", ip: "local" }));
  } finally { await accounts.close(); }
}
if (process.argv[1]?.endsWith("promote.ts")) await promote(process.argv.slice(2));
