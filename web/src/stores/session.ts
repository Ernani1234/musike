import { getT } from "../i18n";
import { responseFailure, recordPlayback } from "../lib/playbackDiagnostics";
import { create } from "zustand";

export interface SessionUser { id: string; name: string; phone: string; role: "admin" | "user"; status: string; }
export interface SessionInfo { enabled: boolean; user: SessionUser | null; google: boolean; admin?: boolean; }
export const useSession = create<SessionInfo>(() => ({ enabled: false, user: null, google: false }));
export async function accountRequest<T>(url: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", redirect: "manual", signal: AbortSignal.timeout(20_000), method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json", "x-musike-request": "1" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const failure = responseFailure(response);
  if (failure && !response.headers.get("content-type")?.includes("json")) {
    await response.body?.cancel(); recordPlayback("account.error", { reason: failure, status: response.status });
    throw new Error(failure === "authentication" || failure === "edge_challenge" ? getT().features.authExpired : getT().features.unexpectedResponse);
  }
  const data = await response.json();
  if (response.status === 401) window.dispatchEvent(new Event("musike:unauthorized"));
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data as T;
}
