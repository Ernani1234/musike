import { execFile } from "node:child_process";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "./config.js";

const exec = promisify(execFile);
const isWindows = process.platform === "win32";

export interface Tools {
  ytdlp: string | null;
  deno: string | null;
  ffmpeg: string | null;
  winget: string | null;
  /** Environment for child processes, with a PATH that can see every tool found. */
  env: NodeJS.ProcessEnv;
}

let current: Tools = { ytdlp: null, deno: null, ffmpeg: null, winget: null, env: process.env };

export const tools = (): Tools => current;

const pathKey = (env: NodeJS.ProcessEnv) => Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";

/**
 * The PATH stored in the Windows registry. Processes started before an install (VS Code and every
 * terminal it opens) keep a stale copy, so a freshly installed yt-dlp would look missing.
 */
async function registryPath(): Promise<string[]> {
  if (!isWindows) return [];
  const keys = ["HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment", "HKCU\\Environment"];
  const parts: string[] = [];
  for (const key of keys) {
    try {
      const { stdout } = await exec("reg", ["query", key, "/v", "Path"], { windowsHide: true });
      const value = /\bPath\s+REG_(?:EXPAND_)?SZ\s+(.*)$/im.exec(stdout)?.[1] ?? "";
      const expanded = value.replace(/%([^%]+)%/g, (m, name: string) => process.env[name] ?? m);
      parts.push(...expanded.split(";"));
    } catch {
      // key or value missing
    }
  }
  return parts;
}

/** winget portable packages live here even when their folder never made it onto any PATH. */
function wingetPackageDirs(): string[] {
  const root = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet");
  if (!root) return [];
  const dirs = [path.join(root, "Links")];
  const packages = path.join(root, "Packages");
  if (!existsSync(packages)) return dirs;
  for (const pkg of readdirSync(packages)) {
    if (!/^(yt-dlp\.yt-dlp|yt-dlp\.FFmpeg|Gyan\.FFmpeg|DenoLand\.Deno)_/i.test(pkg)) continue;
    const dir = path.join(packages, pkg);
    dirs.push(dir);
    // FFmpeg builds nest the binaries: <pkg>/ffmpeg-<version>/bin
    for (const sub of readdirSync(dir)) {
      const bin = path.join(dir, sub, "bin");
      if (existsSync(bin)) dirs.push(bin);
    }
  }
  return dirs;
}

function find(name: string, dirs: string[]): string | null {
  const exts = isWindows ? [".exe", ".cmd", ".bat"] : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const file = path.join(dir, name + ext);
      // lstat, not stat: winget.exe is an app execution alias (a reparse point stat can't follow).
      const stats = lstatSync(file, { throwIfNoEntry: false });
      // A folder is not a binary. On macOS and Linux the downloaded FFmpeg lives in <bin>/ffmpeg/ffmpeg,
      // so the bare name matches the folder first; skipping it lets the next candidate find the binary.
      if (stats && !stats.isDirectory()) return file;
    }
  }
  return null;
}

/** Locates yt-dlp, Deno, FFmpeg and winget. Call again after installing or updating tools. */
export async function refreshTools(): Promise<Tools> {
  const key = pathKey(process.env);
  const seen = new Set<string>();
  // With a private bin folder (desktop app), use only Musike's own copies: known versions that can self-update,
  // instead of whatever happens to be on the user's PATH.
  const own = config.binDir ? [config.binDir, path.join(config.binDir, "ffmpeg")] : [];
  const system = config.binDir ? [] : [...(process.env[key] ?? "").split(path.delimiter), ...(await registryPath()), ...wingetPackageDirs()];
  const dirs = [...own, ...system]
    .map((d) => d.trim().replace(/^"|"$/g, ""))
    .filter((d) => {
      const id = isWindows ? d.toLowerCase() : d;
      if (!d || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

  const ytdlp = config.ytdlpPath ?? find("yt-dlp", dirs);
  const deno = find("deno", dirs);
  const ffmpeg = find("ffmpeg", dirs);
  const winget = isWindows ? find("winget", dirs) : null;

  // Put the tool folders first so yt-dlp itself finds Deno (YouTube challenges) and FFmpeg (HD merge).
  const toolDirs = [ytdlp, deno, ffmpeg].filter((p): p is string => !!p).map((p) => path.dirname(p));
  const inherited = (process.env[key] ?? "").split(path.delimiter).filter(Boolean);
  const env = { ...process.env, [key]: [...new Set([...toolDirs, ...dirs, ...inherited])].join(path.delimiter) };

  current = { ytdlp, deno, ffmpeg, winget, env };
  return current;
}
