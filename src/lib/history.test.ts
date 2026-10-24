import { describe, expect, it } from "vitest";
import { History } from "./history";

const sized = (limits = { maxSteps: 50, maxBytes: 1e9 }) => new History<number[]>((all) => all.reduce((n, s) => n + s.length, 0), limits);

describe("History", () => {
  it("undoes and redoes in order", () => {
    const h = sized();
    h.record([1]); // state 1 -> 2
    h.record([2]); // state 2 -> 3
    expect(h.undo([3])).toEqual([2]);
    expect(h.undo([2])).toEqual([1]);
    expect(h.undo([1])).toBeNull();
    expect(h.redo([1])).toEqual([2]);
    expect(h.redo([2])).toEqual([3]);
    expect(h.canRedo).toBe(false);
  });

  it("clears redo after a new change", () => {
    const h = sized();
    h.record([1]);
    h.undo([2]);
    h.record([1]);
    expect(h.canRedo).toBe(false);
  });

  it("drops the oldest steps beyond the step limit", () => {
    const h = sized({ maxSteps: 2, maxBytes: 1e9 });
    h.record([1]);
    h.record([2]);
    h.record([3]);
    expect(h.undo([4])).toEqual([3]);
    expect(h.undo([3])).toEqual([2]);
    expect(h.canUndo).toBe(false);
  });

  it("counts shared data once when the caller's bytesOf deduplicates", () => {
    const shared = [1, 1, 1];
    const h = new History<number[]>((all) => new Set(all).size * 3, { maxSteps: 50, maxBytes: 3 });
    h.record(shared);
    h.record(shared);
    expect(h.undo([0])).toBe(shared);
    expect(h.undo(shared)).toBe(shared);
  });

  it("drops the oldest steps beyond the memory budget", () => {
    const h = sized({ maxSteps: 50, maxBytes: 5 });
    h.record([1, 1, 1]);
    h.record([2, 2, 2]);
    expect(h.undo([0])).toEqual([2, 2, 2]);
    expect(h.canUndo).toBe(false);
  });
});
