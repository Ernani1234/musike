import { create } from "zustand";

export interface SessionUser { id: string; name: string; phone: string; role: "admin" | "user"; status: string; }
export interface SessionInfo { enabled: boolean; user: SessionUser | null; google: boolean; admin?: boolean; }
export const useSession = create<SessionInfo>(() => ({ enabled: false, user: null, google: false }));
export async function accountRequest<T>(url: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json", "x-musike-request": "1" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (response.status === 401) window.dispatchEvent(new Event("musike:unauthorized"));
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data as T;
}
