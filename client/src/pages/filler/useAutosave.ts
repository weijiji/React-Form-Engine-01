import { useCallback, useEffect, useRef, useState } from "react";
import type { FormValues } from "form-engine-core";

/**
 * Autosave (CONTEXT.md "Draft": debounced onChange + 30s fallback + dirty detection).
 *
 * The `Form` component fires `onChange` on every value edit; we debounce that
 * into a `save` call, skip it entirely when nothing changed (dirty detection via
 * a serialized snapshot), and keep a 30s interval as a safety net. The hook also
 * drives the "草稿已保存 X 秒前" indicator.
 */
export interface Autosave {
  /** Feed the form's latest values here (already debounced + dirty-gated). */
  onValues: (values: FormValues) => void;
  /** Force a save immediately (e.g. before navigating away or submitting). */
  flush: () => Promise<void>;
  /** True while a save request is in flight. */
  saving: boolean;
  /** Human label for the save indicator, or "" when nothing saved yet. */
  label: string;
}

export function useAutosave(
  save: (values: FormValues) => Promise<void>,
  initialValues: FormValues = {},
): Autosave {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(0);

  const latestRef = useRef<FormValues>(initialValues);
  const savedSerializedRef = useRef<string>(JSON.stringify(initialValues));
  const debounceRef = useRef<number | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const persist = useCallback(async (): Promise<void> => {
    const serialized = JSON.stringify(latestRef.current);
    if (serialized === savedSerializedRef.current) return; // no change — skip request
    setSaving(true);
    try {
      await saveRef.current(latestRef.current);
      savedSerializedRef.current = serialized;
      setSavedAt(Date.now());
      setNow(Date.now());
    } finally {
      setSaving(false);
    }
  }, []);

  const onValues = useCallback(
    (values: FormValues): void => {
      latestRef.current = values;
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => void persist(), 1000);
    },
    [persist],
  );

  // 30s fallback — catches anything the debounce missed (e.g. a tab backgrounded
  // before the timer fired).
  useEffect(() => {
    const id = window.setInterval(() => void persist(), 30_000);
    return () => window.clearInterval(id);
  }, [persist]);

  // Clear any pending debounce on unmount (the caller flushes before leaving).
  useEffect(
    () => () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    },
    [],
  );

  // Tick the "X 秒前" counter once per second while there's something to show.
  useEffect(() => {
    if (savedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [savedAt]);

  const label = saving
    ? "保存中…"
    : savedAt === null
      ? ""
      : `草稿已保存 ${Math.max(0, Math.floor((now - savedAt) / 1000))} 秒前`;

  const flush = useCallback(async (): Promise<void> => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await persist();
  }, [persist]);

  return { onValues, flush, saving, label };
}
