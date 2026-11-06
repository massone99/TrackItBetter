import { linkHost, normalizeVideoUrl, stretchStrongId } from '../url';

describe('normalizeVideoUrl', () => {
  it('keeps valid links and adds a missing scheme', () => {
    expect(normalizeVideoUrl(' https://youtu.be/abc ')).toBe('https://youtu.be/abc');
    expect(normalizeVideoUrl('www.youtube.com/watch?v=abc')).toBe('https://www.youtube.com/watch?v=abc');
  });

  it('treats empty input as no link', () => {
    expect(normalizeVideoUrl('   ')).toBeNull();
  });

  it('rejects other schemes and non-links', () => {
    expect(normalizeVideoUrl('javascript:alert(1)')).toBeUndefined();
    expect(normalizeVideoUrl('file:///video.mp4')).toBeUndefined();
    expect(normalizeVideoUrl('not a link')).toBeUndefined();
    expect(normalizeVideoUrl('localhost')).toBeUndefined();
  });
});

describe('StretchStrong links', () => {
  it('accepts the exercise link or just its id, and nothing else on that scheme', () => {
    expect(normalizeVideoUrl('stretchstrong://exercise/recPWK5BgJUjfrsNO')).toBe('stretchstrong://exercise/recPWK5BgJUjfrsNO');
    expect(normalizeVideoUrl(' recPWK5BgJUjfrsNO ')).toBe('stretchstrong://exercise/recPWK5BgJUjfrsNO');
    expect(normalizeVideoUrl('stretchstrong://exercise/')).toBeUndefined();
    expect(normalizeVideoUrl('stretchstrong://other/recPWK5BgJUjfrsNO')).toBeUndefined();
  });

  it('reads the id out of a link', () => {
    expect(stretchStrongId('stretchstrong://exercise/recPWK5BgJUjfrsNO')).toBe('recPWK5BgJUjfrsNO');
    expect(stretchStrongId('https://youtu.be/abc')).toBeNull();
    expect(linkHost('stretchstrong://exercise/recPWK5BgJUjfrsNO')).toBe('StretchStrong');
  });
});

describe('linkHost', () => {
  it('shows the host without www', () => {
    expect(linkHost('https://www.youtube.com/watch?v=abc')).toBe('youtube.com');
  });
});
