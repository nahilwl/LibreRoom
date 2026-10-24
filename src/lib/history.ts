/**
 * Undo/redo stacks of document snapshots, bounded by a memory budget and a maximum number of
 * steps. The oldest steps are dropped first. Snapshots may share data (immutable documents),
 * so the budget is measured over all of them at once by `bytesOf`.
 */
export interface HistoryLimits {
  maxSteps: number;
  maxBytes: number;
}

export class History<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(
    private readonly bytesOf: (snapshots: T[]) => number,
    private readonly limits: HistoryLimits = { maxSteps: 50, maxBytes: 256 * 1024 * 1024 },
  ) {}

  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }

  /** Call with the state *before* a change. Clears the redo stack. */
  record(before: T) {
    this.past.push(before);
    this.future = [];
    this.trim();
  }

  /** Returns the state to restore, or null. `current` becomes redoable. */
  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    return next;
  }

  clear() {
    this.past = [];
    this.future = [];
  }

  private trim() {
    const tooBig = () => this.bytesOf([...this.past, ...this.future]) > this.limits.maxBytes;
    while (this.past.length > 0 && (this.past.length > this.limits.maxSteps || tooBig())) this.past.shift();
  }
}
