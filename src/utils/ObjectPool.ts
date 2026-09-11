export interface Pooled { active: boolean }
/** Fixed capacity: exhaustion skips an optional object; it never grows mid-run. */
export class ObjectPool<T extends Pooled> {
  readonly items: T[];
  constructor(size: number, create: (index: number) => T) { this.items = Array.from({ length: size }, (_, i) => create(i)); }
  acquire(): T | undefined {
    for (const item of this.items) if (!item.active) { item.active = true; return item; }
    return undefined;
  }
  release(item: T): void { item.active = false; }
  reset(release?: (item: T) => void): void { for (const item of this.items) { item.active = false; release?.(item); } }
  get count(): number { let count = 0; for (const item of this.items) if (item.active) count++; return count; }
}
