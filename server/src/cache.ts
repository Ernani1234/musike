/** Bounded, time-boxed async memo shared by the server and native build. */
export function cached<T>(ttl: number, load: (key: string) => Promise<T>, limit = 200): (key: string) => Promise<T> {
  const memo = new Map<string, { at: number; value: Promise<T> }>();
  return (key) => {
    const now = Date.now();
    for (const [id, entry] of memo) if (now - entry.at >= ttl) memo.delete(id);
    const hit = memo.get(key);
    if (hit) return hit.value;
    if (memo.size >= limit) memo.delete(memo.keys().next().value!);
    const value = Promise.resolve().then(() => load(key));
    memo.set(key, { at: now, value });
    value.catch(() => { if (memo.get(key)?.value === value) memo.delete(key); });
    return value;
  };
}
