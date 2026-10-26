import { useTheme } from './ThemeProvider';

/** The ink of the thin lines that draw sheets and fields: the text colour in the light theme, a softer one in the dark theme. */
export function useInk(): string {
  const { mode, palette } = useTheme();
  return mode === 'light' ? palette.text : palette.textMuted;
}
