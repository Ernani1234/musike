import { Worker } from "node:worker_threads";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export const schema = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS migrations(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '',
 role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')), status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('pending','approved','disabled')),
 created_at INTEGER NOT NULL, last_seen INTEGER);
CREATE INDEX IF NOT EXISTS users_role_status ON users(role,status);
CREATE TABLE IF NOT EXISTS libraries(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, json TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS invites(hash TEXT PRIMARY KEY, phone TEXT, expires_at INTEGER NOT NULL, used_by TEXT REFERENCES users(id), created_by TEXT NOT NULL REFERENCES users(id));
CREATE TABLE IF NOT EXISTS otps(id TEXT PRIMARY KEY, phone TEXT NOT NULL, ip TEXT NOT NULL, hash TEXT NOT NULL, invite_hash TEXT,
 expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed INTEGER NOT NULL DEFAULT 0,
 delivery TEXT NOT NULL, remember INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS otps_phone_time ON otps(phone,created_at);
CREATE INDEX IF NOT EXISTS otps_ip_time ON otps(ip,created_at);
CREATE TABLE IF NOT EXISTS sessions(access_hash TEXT PRIMARY KEY, refresh_hash TEXT NOT NULL UNIQUE, access_enc TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, access_expires INTEGER NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, actor TEXT, action TEXT NOT NULL, target TEXT, ip TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'info');
CREATE INDEX IF NOT EXISTS audit_time ON audit(at DESC);
CREATE INDEX IF NOT EXISTS audit_level_id ON audit(level,id DESC);
CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_hash TEXT NOT NULL, ip TEXT NOT NULL,last_activity INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS clients_activity ON clients(last_activity);
CREATE TABLE IF NOT EXISTS google_tokens(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, encrypted TEXT NOT NULL,
 auto_sync INTEGER NOT NULL DEFAULT 0,last_sync INTEGER, next_sync INTEGER);
CREATE INDEX IF NOT EXISTS google_sync_due ON google_tokens(auto_sync,next_sync);
CREATE TABLE IF NOT EXISTS oauth_states(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 verifier_enc TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS import_runs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL,created_at INTEGER NOT NULL,report TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS import_runs_user_time ON import_runs(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS import_items(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,source_id TEXT NOT NULL,
 kind TEXT NOT NULL,destination_id TEXT NOT NULL,PRIMARY KEY(user_id,source_id,kind));
`;

type Value = string | number | null;
export type Statement = { sql: string; params?: Value[]; mode?: "get" | "all" | "run" };
/** SQLite is synchronous only inside this worker; request handlers await RPC, never block on SQL. */
export class Database {
  private worker: Worker;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private serial = 0;
  private ending = false;
  private unavailable = false;
  private closed: Promise<void> | null = null;
  private constructor(file: string) {
    const source = `const {parentPort,workerData}=require('node:worker_threads');
      const {DatabaseSync}=require('node:sqlite');
      const db=new DatabaseSync(workerData.file);db.exec(workerData.schema);
      const execute=({sql,params=[],mode='run'})=>{const q=db.prepare(sql);const value=q[mode](...params);
        return mode==='run'?{changes:Number(value.changes),lastInsertRowid:Number(value.lastInsertRowid)}:value;};
      parentPort.on('message',({id,operation,statements})=>{try{let result;
        if(operation==='close'){db.close();parentPort.postMessage({id,result:true});parentPort.close();return;}
        if(operation==='batch'){db.exec('BEGIN IMMEDIATE');try{result=statements.map(execute);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
        else result=execute(statements[0]);parentPort.postMessage({id,result});
      }catch(e){parentPort.postMessage({id,error:'Database operation failed',detail:e.message});}});
      parentPort.postMessage({id:0,result:true});`;
    this.worker = new Worker(source, { eval: true, workerData: { file, schema } });
    this.worker.on("message", ({ id, result, error, detail }) => {
      const job = this.pending.get(id); if (!job) return; this.pending.delete(id);
      if (error) job.reject(new Error(error, { cause: detail })); else job.resolve(result);
    });
    const fail = () => { this.unavailable = true; for (const job of this.pending.values()) job.reject(new Error("Database worker unavailable")); this.pending.clear(); };
    this.worker.on("error", fail); this.worker.on("exit", fail);
  }
  static async open(file: string) {
    await mkdir(path.dirname(file), { recursive: true });
    const db = new Database(file);
    await new Promise((resolve, reject) => db.pending.set(0, { resolve, reject }));
    return db;
  }
  private request<T>(operation: string, statements: Statement[]): Promise<T> {
    if (this.unavailable || (this.ending && operation !== "close")) return Promise.reject(new Error("Database is closed"));
    const id = ++this.serial;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.worker.postMessage({ id, operation, statements }); });
  }
  get<T = Record<string, any>>(sql: string, params: Value[] = []) { return this.request<T | undefined>("query", [{ sql, params, mode: "get" }]); }
  all<T = Record<string, any>>(sql: string, params: Value[] = []) { return this.request<T[]>("query", [{ sql, params, mode: "all" }]); }
  run(sql: string, params: Value[] = []) { return this.request<{ changes: number }>("query", [{ sql, params }]); }
  batch(statements: Statement[]) { return this.request<any[]>("batch", statements); }
  close(): Promise<void> {
    this.closed ??= (async () => { this.ending = true; try { if (!this.unavailable) await this.request("close", []); } finally { await this.worker.terminate(); } })();
    return this.closed;
  }
}
