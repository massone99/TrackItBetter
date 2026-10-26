/** Appearance of the workout's exercise cards and set buttons, chosen in the profile. */
export type SetRows = 'table' | 'open';
export type SetButtons = 'standard' | 'large';
export type CheckSide = 'right' | 'left';
export type SetLayout = { rows: SetRows; buttons: SetButtons; check: CheckSide };

export const DEFAULT_SET_LAYOUT: SetLayout = { rows: 'table', buttons: 'standard', check: 'right' };

export const SET_LAYOUT_OPTIONS: { [K in keyof SetLayout]: SetLayout[K][] } = {
  rows: ['table', 'open'],
  buttons: ['standard', 'large'],
  check: ['right', 'left'],
};

export const setLayoutKey = (key: keyof SetLayout) => `appearance.sets.${key}`;

export function parseSetLayout(read: (key: string) => string | null): SetLayout {
  const pick = <K extends keyof SetLayout>(key: K): SetLayout[K] => {
    const stored = read(setLayoutKey(key));
    return (SET_LAYOUT_OPTIONS[key] as string[]).includes(stored ?? '') ? (stored as SetLayout[K]) : DEFAULT_SET_LAYOUT[key];
  };
  return { rows: pick('rows'), buttons: pick('buttons'), check: pick('check') };
}
