import { useEffect, useState } from "react";
import { clearAutosave, readAutosave, writeAutosave, type AutosaveRecord } from "../lib/autosave";
import type { Doc } from "../lib/document";

const DELAY_MS = 1500;

/**
 * Writes the document to IndexedDB shortly after each change while it is dirty, and exposes
 * the record left over by a previous session (crash or close with unsaved work).
 */
export function useAutosave(doc: Doc | null, dirty: boolean, onError: (e: Error) => void) {
  const [recovered, setRecovered] = useState<AutosaveRecord | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    readAutosave()
      .then((r) => r && setRecovered(r))
      .catch(onError);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only at startup

  useEffect(() => {
    if (!doc || !dirty) return;
    const timer = setTimeout(() => {
      writeAutosave(doc)
        .then(() => setSavedAt(Date.now()))
        .catch(onError);
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc, dirty]); // eslint-disable-line react-hooks/exhaustive-deps -- a new document value = a change

  const discard = () => {
    setRecovered(null);
    setSavedAt(null);
    return clearAutosave().catch(onError);
  };

  return { recovered, savedAt, dismissRecovered: () => setRecovered(null), discard };
}
