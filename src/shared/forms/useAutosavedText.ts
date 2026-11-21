import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A text field that saves by itself: a short pause after typing stops, on blur (`flush`) and when
 * the field goes away. `onSave` gets the trimmed text, and only when it differs from what was last
 * saved, so reopening or blurring an untouched field writes nothing.
 */
export function useAutosavedText(initial: string, onSave: (text: string) => void, delayMs = 700) {
  const [value, setValue] = useState(initial);
  const saved = useRef(initial.trim());
  const draft = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const next = draft.current.trim();
    if (next === saved.current) return;
    saved.current = next;
    onSaveRef.current(next);
  }, []);

  const change = useCallback((text: string) => {
    draft.current = text;
    setValue(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delayMs);
  }, [flush, delayMs]);

  // Leaving the screen, or the field being replaced, saves what is pending.
  useEffect(() => flush, [flush]);

  return { value, change, flush };
}
