import { spawn } from "node:child_process";

export class ProcessError extends Error {
  constructor(public reason: "timeout" | "output" | "spawn" | "shutdown" | "cancelled", message: string) { super(message); }
}
const running = new Set<() => void>();

/** Bounded capture, deadline and termination escalation without releasing a live process's queue slot. */
export function runProcess(command: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number, maxBytes = 16 * 1024 * 1024, signal?: AbortSignal) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    if (signal?.aborted) { reject(new ProcessError("cancelled", "Process cancelled")); return; }
    const grouped = process.platform !== "win32";
    const child = spawn(command, args, { windowsHide: true, env, detached: grouped });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;
    let failure: ProcessError | null = null;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (grouped && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch { /* process already exited */ }
    };
    const stop = (reason: ProcessError) => {
      if (failure) return;
      failure = reason;
      kill("SIGTERM");
      escalation = setTimeout(() => kill("SIGKILL"), 2000);
    };
    const shutdown = () => stop(new ProcessError("shutdown", "Server is shutting down"));
    const cancel = () => stop(new ProcessError("cancelled", "Process cancelled"));
    signal?.addEventListener("abort", cancel, { once: true });
    running.add(shutdown);
    const timer = setTimeout(() => stop(new ProcessError("timeout", "Process deadline exceeded")), timeoutMs);
    const capture = (target: Buffer[]) => (data: Buffer) => {
      size += data.length;
      if (size > maxBytes) return stop(new ProcessError("output", "Process output limit exceeded"));
      if (!failure) target.push(data);
    };
    child.stdout.on("data", capture(stdout));
    child.stderr.on("data", capture(stderr));
    child.once("error", (error) => { failure ??= new ProcessError("spawn", error.message); });
    child.once("close", (code) => {
      clearTimeout(timer);
      clearTimeout(escalation);
      running.delete(shutdown);
      signal?.removeEventListener("abort", cancel);
      if (failure) reject(failure);
      else resolve({ stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString(), code });
    });
  });
}

export function stopProcesses() { for (const stop of running) stop(); }
