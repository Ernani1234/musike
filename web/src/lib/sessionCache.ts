/** Capacity-bounded session data with lazy expiry. Values may be null or undefined. */
export class SessionCache<K, V> {
  private items = new Map<K, { value: V; expires: number }>();
  constructor(private limit: number, private ttl = Infinity) {
    if (!Number.isInteger(limit) || limit < 1 || ttl <= 0) throw new Error("Invalid cache bounds");
  }
  private prune() {
    const now = Date.now();
    for (const [key, item] of this.items) if (item.expires <= now) this.items.delete(key);
  }
  get(key: K): V | undefined {
    const item = this.items.get(key);
    if (item && item.expires <= Date.now()) { this.items.delete(key); return undefined; }
    return item?.value;
  }
  has(key: K): boolean { this.get(key); return this.items.has(key); }
  set(key: K, value: V): this {
    this.prune();
    this.items.delete(key);
    if (this.items.size >= this.limit) this.items.delete(this.items.keys().next().value!);
    this.items.set(key, { value, expires: Date.now() + this.ttl });
    return this;
  }
  delete(key: K): boolean { return this.items.delete(key); }
  clear() { this.items.clear(); }
  *[Symbol.iterator](): IterableIterator<[K, V]> {
    this.prune();
    for (const [key, item] of this.items) yield [key, item.value];
  }
}
