import { cappedTextGrowth, FONT_KEYS, MAX_FONT_SCALE, scaleStyle, scaleStyles, TEXT_SCALE_CAPS, textGrowth, toUiScale, withMinFontSize } from '../scale';

describe('scaleStyle', () => {
  it('scales layout sizes and leaves fonts, colors and percentages alone', () => {
    const scaled = scaleStyle({ padding: 20, gap: 10, width: '100%', fontSize: 16, color: '#fff', borderWidth: 1 }, 0.85);
    expect(scaled).toEqual({ padding: 17, gap: 8.5, width: '100%', fontSize: 16, color: '#fff', borderWidth: 1 });
  });

  it('can scale font metrics when asked', () => {
    expect(scaleStyle({ fontSize: 20, lineHeight: 24 }, 1.1, FONT_KEYS)).toEqual({ fontSize: 22, lineHeight: 26.4 });
  });

  it('keeps touch targets designed at 48 dp or more at least 48 dp at small sizes', () => {
    expect(scaleStyle({ minHeight: 48, width: 56, height: 36, padding: 48 }, 0.7)).toEqual({ minHeight: 48, width: 48, height: 25.2, padding: 33.6 });
    expect(scaleStyle({ minHeight: 48 }, 1.3)).toEqual({ minHeight: 62.4 });
  });

  it('returns the same objects at 100 %', () => {
    const styles = { card: { padding: 12 } };
    expect(scaleStyles(styles, 1)).toBe(styles);
  });
});

describe('withMinFontSize', () => {
  it('raises small text to 12 dp and grows its line height in proportion', () => {
    expect(withMinFontSize({ fontSize: 8.4, lineHeight: 11.2 })).toEqual({ fontSize: 12, lineHeight: 16 });
    expect(withMinFontSize({ fontSize: 9 })).toEqual({ fontSize: 12 });
  });

  it('leaves text of 12 dp and up alone', () => {
    const style = { fontSize: 12, lineHeight: 16 };
    expect(withMinFontSize(style)).toBe(style);
  });
});

describe('toUiScale', () => {
  it('accepts presets only', () => {
    expect(toUiScale('0.92')).toBe(0.92);
    expect(toUiScale('0.5')).toBe(1);
    expect(toUiScale(null)).toBe(1);
  });
});

describe('effectiveScale', () => {
  const { effectiveScale } = jest.requireActual('../scale');
  it('keeps the chosen size on normal screens and tightens it on narrow ones', () => {
    expect(effectiveScale(1, 390)).toBe(1);
    expect(effectiveScale(1.1, 360)).toBe(1.1);
    expect(effectiveScale(1, 350)).toBe(0.95);
    expect(effectiveScale(1.1, 320)).toBe(0.99);
    expect(effectiveScale(1, 0)).toBe(1);
  });
  it('caps what the system font size adds to text inputs', () => {
    expect(MAX_FONT_SCALE).toBeGreaterThan(1);
    expect(MAX_FONT_SCALE).toBeLessThanOrEqual(TEXT_SCALE_CAPS.full);
  });
});

describe('textGrowth', () => {
  it('lets body text follow the phone fully and large text grow less', () => {
    expect(textGrowth(16, 1)).toBe(1);
    expect(textGrowth(16, 2)).toBe(2);
    expect(textGrowth(22, 2)).toBeCloseTo(1.7);
    expect(textGrowth(30, 2)).toBeCloseTo(1.1);
    expect(textGrowth(104, 2)).toBeCloseTo(1.1);
  });

  it('keeps text within 200 % overall when the interface size is larger too', () => {
    expect(cappedTextGrowth(16, 2, 1)).toBe(2);
    expect(cappedTextGrowth(16 * 1.3, 2, 1.3)).toBeCloseTo(2 / 1.3);
    expect(cappedTextGrowth(16 * 1.3, 1, 1.3)).toBe(1);
    expect(cappedTextGrowth(16 * 0.7, 2, 0.7)).toBe(2);
  });
});
