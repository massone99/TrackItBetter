import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';

/**
 * Saves edits on the way out of a screen (header back, gesture, system back, tab switch), so leaving
 * never silently drops work. `save` returns false when the edits are invalid: then `onInvalid` gets
 * the navigation to resume later (e.g. after a "discard changes?" question); without it the
 * invalid edits are dropped and the navigation goes ahead. Call `allowLeave` before navigating away
 * after an explicit save, so the edits are not saved twice.
 */
export function useSaveOnLeave({ dirty, save, onInvalid }: {
  dirty: boolean;
  save: () => Promise<boolean>;
  onInvalid?: (resume: () => void) => void;
}): { allowLeave: () => void } {
  const navigation = useNavigation();
  const latest = useRef({ dirty, save, onInvalid });
  useEffect(() => { latest.current = { dirty, save, onInvalid }; });
  const leaving = useRef(false);

  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (leaving.current || !latest.current.dirty) return;
    event.preventDefault();
    const action = event.data.action;
    // The original navigation goes ahead, whatever it was (back, tab switch, replace).
    const resume = () => { leaving.current = true; navigation.dispatch(action); };
    leaving.current = true;
    void latest.current.save().then(
      (saved) => {
        leaving.current = false;
        if (saved) resume();
        else if (latest.current.onInvalid) latest.current.onInvalid(resume);
        else resume();
      },
      () => { leaving.current = false; latest.current.onInvalid?.(resume); },
    );
  }), [navigation]);

  return { allowLeave: () => { leaving.current = true; } };
}
