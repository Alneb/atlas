// Asks made while someone types (a search, a hint): wait for the typing to pause, and let only the newest ask's answer
// land — an answer to an older text arriving late is dropped.
export class Newest {
  #seq = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  /** `wait`: how long typing must pause before an ask goes out (ms). */
  constructor(private readonly wait: number) {}

  /** A new ask: every older one is stale from now on. The returned check stays true until the next ask or `stop()`. */
  ask(): () => boolean {
    clearTimeout(this.#timer);
    const my = ++this.#seq;
    return () => my === this.#seq;
  }

  /** Once typing has paused, `fn` runs with its check (to test after each await); a newer ask first skips it. */
  run(fn: (still: () => boolean) => unknown): void {
    const still = this.ask();
    this.#timer = setTimeout(() => { if (still()) void fn(still); }, this.wait);
  }

  /** For an ask that must pause midway: waits `wait` ms and says whether it is still the newest. */
  settle(still: () => boolean): Promise<boolean> {
    return new Promise((r) => setTimeout(() => r(still()), this.wait));
  }

  /** Nothing pending lands (the text was cleared, the view went away). */
  stop(): void {
    clearTimeout(this.#timer);
    this.#seq++;
  }
}
