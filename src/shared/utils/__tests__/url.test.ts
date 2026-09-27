import { linkHost, normalizeVideoUrl } from '../url';

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

describe('linkHost', () => {
  it('shows the host without www', () => {
    expect(linkHost('https://www.youtube.com/watch?v=abc')).toBe('youtube.com');
  });
});
