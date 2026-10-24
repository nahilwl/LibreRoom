import { AppError } from "../i18n";
import type { Doc } from "./document";
import { docFromBlobs, docToBlobs, type DocBlobs } from "./files";

/**
 * Crash recovery: the current document is written to IndexedDB shortly after each change.
 * The record is removed when work is saved to a file or explicitly discarded, so a record
 * found at startup means the previous session ended with unsaved work.
 */
const DB_NAME = "libreroom";
const STORE = "autosave";
const KEY = "current";

/** Bumped when DocBlobs changes shape; older records are ignored. */
const RECORD_VERSION = 2;
export type AutosaveRecord = DocBlobs & { savedAt: number; version: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new AppError("error.storage", { message: String(req.error) }));
  });
}

async function tx<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new AppError("error.storage", { message: String(req.error) }));
    });
  } finally {
    db.close();
  }
}

export async function writeAutosave(doc: Doc) {
  const record: AutosaveRecord = { ...(await docToBlobs(doc)), savedAt: Date.now(), version: RECORD_VERSION };
  await tx("readwrite", (s) => s.put(record, KEY));
}

export const readAutosave = async () => {
  const r = await tx<AutosaveRecord | undefined>("readonly", (s) => s.get(KEY));
  return r?.version === RECORD_VERSION ? r : undefined;
};
export const clearAutosave = () => tx("readwrite", (s) => s.delete(KEY));
export const restoreAutosave = (r: AutosaveRecord) => docFromBlobs(r);
