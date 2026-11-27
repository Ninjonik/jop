/** Lowest cost first; equal-cost candidates retain their original insertion order. */
export class RouteSearchQueue<T extends { cost: number }> {
  private entries: { value: T; order: number }[] = [];
  private nextOrder = 0;

  get length() {
    return this.entries.length;
  }

  private precedes(left: number, right: number) {
    const a = this.entries[left];
    const b = this.entries[right];
    return a.value.cost < b.value.cost || (a.value.cost === b.value.cost && a.order < b.order);
  }

  push(value: T) {
    this.entries.push({ value, order: this.nextOrder++ });
    let child = this.entries.length - 1;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (!this.precedes(child, parent)) break;
      [this.entries[parent], this.entries[child]] = [this.entries[child], this.entries[parent]];
      child = parent;
    }
  }

  shift(): T | undefined {
    const first = this.entries[0];
    const last = this.entries.pop();
    if (!first || !last) return undefined;
    if (this.entries.length) {
      this.entries[0] = last;
      let parent = 0;
      while (true) {
        const left = parent * 2 + 1;
        if (left >= this.entries.length) break;
        const right = left + 1;
        const child = right < this.entries.length && this.precedes(right, left) ? right : left;
        if (!this.precedes(child, parent)) break;
        [this.entries[parent], this.entries[child]] = [this.entries[child], this.entries[parent]];
        parent = child;
      }
    }
    return first.value;
  }
}
