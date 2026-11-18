/** Ordered requests with immediate optimistic updates replayed over the last confirmed state. */
export class OptimisticQueue<S> {
  private tail: Promise<unknown> = Promise.resolve();
  private pending: { apply: (state: S) => S }[] = [];
  constructor(private confirmed: S, private publish: (state: S) => void) {}
  private render() {
    this.publish(this.pending.reduce((state, op) => op.apply(state), this.confirmed));
  }
  run<R>(apply: (state: S) => S, request: () => Promise<R>, commit: (state: S, result: R) => S): Promise<R> {
    const op = { apply };
    this.pending.push(op);
    this.render();
    const remove = () => { this.pending = this.pending.filter((item) => item !== op); this.render(); };
    const result = this.tail.then(request).then((value) => {
      this.confirmed = commit(this.confirmed, value);
      remove();
      return value;
    }, (error) => {
      remove();
      throw error;
    });
    this.tail = result.catch(() => {});
    return result;
  }
}
