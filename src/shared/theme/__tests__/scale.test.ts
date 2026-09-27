import { FONT_KEYS, scaleStyle, scaleStyles, toUiScale } from '../scale';

describe('scaleStyle', () => {
  it('scales layout sizes and leaves fonts, colors and percentages alone', () => {
    const scaled = scaleStyle({ padding: 20, gap: 10, width: '100%', fontSize: 16, color: '#fff', borderWidth: 1 }, 0.85);
    expect(scaled).toEqual({ padding: 17, gap: 8.5, width: '100%', fontSize: 16, color: '#fff', borderWidth: 1 });
  });

  it('can scale font metrics when asked', () => {
    expect(scaleStyle({ fontSize: 20, lineHeight: 24 }, 1.1, FONT_KEYS)).toEqual({ fontSize: 22, lineHeight: 26.4 });
  });

  it('returns the same objects at 100 %', () => {
    const styles = { card: { padding: 12 } };
    expect(scaleStyles(styles, 1)).toBe(styles);
  });
});

describe('toUiScale', () => {
  it('accepts presets only', () => {
    expect(toUiScale('0.92')).toBe(0.92);
    expect(toUiScale('0.5')).toBe(1);
    expect(toUiScale(null)).toBe(1);
  });
});
