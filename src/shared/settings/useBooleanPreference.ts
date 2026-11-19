import { useState } from 'react';
import { readBooleanPreference, writePreference } from './preferences';

/** Reads and persists a boolean display preference synchronously across visits. */
export function useBooleanPreference(key: string, fallback = false): [boolean, (next?: boolean) => void] {
  const [value, setValue] = useState(() => readBooleanPreference(key, fallback));
  const set = (next?: boolean) => {
    setValue((current) => {
      const resolved = next ?? !current;
      writePreference(key, String(resolved));
      return resolved;
    });
  };
  return [value, set];
}
