import { create } from "zustand";
import type { OfflineSummary } from "../lib/offlineStore";
export const useOffline = create<{ summary: OfflineSummary | null; busy: boolean; error: string; siteUsage: number | null; persistent: boolean | null }>(() => ({ summary: null, busy: false, error: "", siteUsage: null, persistent: null }));
