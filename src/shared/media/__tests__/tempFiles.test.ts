import { discardTemporaryCopy, isCacheFile, sweepTemporaryFiles, TEMP_GRACE_MS } from '../tempFiles';

// A cache folder as a map of path (relative to the cache) to { modified, size }.
jest.mock('expo-file-system', () => {
  const entries = new Map<string, { modified: number; size: number }>();
  const root = 'file:///cache/';
  const rel = (uri: string) => uri.replace(root, '').replace(/\/$/, '');
  class MockFile {
    path: string;
    constructor(uriOrParent: string | { path: string }, name?: string) {
      this.path = typeof uriOrParent === 'string' ? rel(uriOrParent) : `${uriOrParent.path ? `${uriOrParent.path}/` : ''}${name}`;
    }
    get name() { return this.path.split('/').pop()!; }
    get uri() { return root + this.path; }
    get exists() { return entries.has(this.path); }
    get lastModified() { return entries.get(this.path)?.modified ?? null; }
    get creationTime() { return null; }
    get size() { return entries.get(this.path)?.size ?? 0; }
    delete() { entries.delete(this.path); }
  }
  class MockDirectory {
    path: string;
    constructor(path: string) { this.path = path; }
    get name() { return this.path.split('/').pop()!; }
    get uri() { return `${root}${this.path}${this.path ? '/' : ''}`; }
    get exists() { return this.path === '' || [...entries.keys()].some((key) => key.startsWith(`${this.path}/`)) || dirs.has(this.path); }
    list() {
      const prefix = this.path ? `${this.path}/` : '';
      const children = new Set<string>();
      for (const key of [...entries.keys(), ...dirs]) {
        if (!key.startsWith(prefix) || key === this.path) continue;
        children.add(key.slice(prefix.length).split('/')[0]);
      }
      return [...children].map((child) => {
        const full = prefix + child;
        return entries.has(full) ? new MockFile({ path: this.path }, child) : new MockDirectory(full);
      });
    }
    delete() { dirs.delete(this.path); for (const key of [...entries.keys()]) if (key.startsWith(`${this.path}/`)) entries.delete(key); }
  }
  const dirs = new Set<string>();
  return { Paths: { cache: new MockDirectory('') }, File: MockFile, Directory: MockDirectory, mockEntries: entries, mockDirs: dirs };
});
const { mockEntries: entries, mockDirs: dirs } = jest.requireMock('expo-file-system') as {
  mockEntries: Map<string, { modified: number; size: number }>;
  mockDirs: Set<string>;
};

const NOW = 1_800_000_000_000;
const old = (size = 10) => ({ modified: NOW - TEMP_GRACE_MS - 1, size });
const fresh = (size = 10) => ({ modified: NOW - 1000, size });

beforeEach(() => { entries.clear(); dirs.clear(); });

describe('sweepTemporaryFiles', () => {
  it('deletes only old temporary copies and reports the bytes freed', () => {
    entries.set('ImagePicker/a.mp4', old(500));
    entries.set('ImagePicker/b.jpg', fresh());
    entries.set('VideoThumbnails/f.jpg', old(20));
    entries.set('trackitbetter-backup-2026-01-01.json', old(300));
    entries.set('ReactNative-snapshot-image1.png', old(5));
    entries.set('tib-photo-restore-x/0.jpg', old(7));
    entries.set('image_cache/keep.bin', old(999));
    entries.set('unknown.json', old(1));

    expect(sweepTemporaryFiles(NOW)).toBe(500 + 20 + 300 + 5 + 7);
    expect([...entries.keys()].sort()).toEqual(['ImagePicker/b.jpg', 'image_cache/keep.bin', 'unknown.json']);
  });

  it('removes an emptied restore folder but keeps the pickers\' folders', () => {
    dirs.add('ImagePicker');
    dirs.add('tib-photo-restore-y');
    entries.set('tib-photo-restore-y/0.jpg', old());
    sweepTemporaryFiles(NOW);
    expect(dirs.has('tib-photo-restore-y')).toBe(false);
    expect(dirs.has('ImagePicker')).toBe(true);
  });
});

describe('discardTemporaryCopy', () => {
  it('deletes a file in the cache and never one outside it', () => {
    entries.set('ImagePicker/a.jpg', fresh());
    expect(isCacheFile('file:///cache/ImagePicker/a.jpg')).toBe(true);
    expect(isCacheFile('file:///storage/DCIM/a.jpg')).toBe(false);
    expect(isCacheFile('file:///cache-other/a.jpg')).toBe(false);
    discardTemporaryCopy('file:///storage/DCIM/a.jpg');
    expect(entries.size).toBe(1);
    discardTemporaryCopy('file:///cache/ImagePicker/a.jpg');
    expect(entries.size).toBe(0);
  });
});
