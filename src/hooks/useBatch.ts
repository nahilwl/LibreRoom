import { useRef, useState } from "react";
import { runBatch, type BatchItem, type BatchOptions } from "../lib/batch";
import { IMAGE_TYPES } from "../lib/files";
import { newId } from "../lib/document";

/** Batch queue state. Items live only in memory; nothing is written until the user downloads. */
export function useBatch() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const update = (id: string, patch: Partial<BatchItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const add = (files: Iterable<File>) => {
    const accepted = [...files].filter((f) => IMAGE_TYPES.includes(f.type));
    setItems((list) => [...list, ...accepted.map((file) => ({ id: newId(), file, status: "queued" as const }))]);
  };

  const start = async (options: BatchOptions) => {
    if (running) return;
    abort.current = new AbortController();
    setRunning(true);
    try {
      // Re-queue cancelled or failed items so "Process" picks them up again.
      const queue = items.map((i) => (i.status === "cancelled" || i.status === "error" ? { ...i, status: "queued" as const, error: undefined } : i));
      setItems(queue);
      await runBatch(queue, options, abort.current.signal, update);
    } finally {
      setRunning(false);
      setCancelling(false);
    }
  };

  const cancel = () => {
    abort.current?.abort();
    setCancelling(true);
  };

  return {
    items,
    running,
    cancelling,
    add,
    start,
    cancel,
    remove: (id: string) => setItems((list) => list.filter((i) => i.id !== id || i.status === "processing")),
    clear: () => setItems((list) => list.filter((i) => i.status === "processing")),
  };
}
