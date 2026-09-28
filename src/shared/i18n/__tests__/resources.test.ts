import { POSITION_GROUPS, POSITIONS } from '../../../domain/pose';
import { RESET_SCOPES } from '../../../features/data/resetScopes';
import { resources } from '../resources';

// Node's fs is available under Jest; the app's tsconfig has no Node types, so it is typed here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readdirSync, readFileSync, statSync } = require('fs') as {
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: 'utf8') => string;
  statSync: (path: string) => { isDirectory: () => boolean };
};
declare const __dirname: string;
const join = (...parts: string[]) => parts.join('/');

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => (typeof value === 'string' ? [`${prefix}${key}`] : flatten(value, `${prefix}${key}.`)));
}

const PLURAL = /_(zero|one|two|few|many|other)$/;
const en = new Set(flatten(resources.en.translation as unknown as Tree));
const italian = new Set(flatten(resources.it.translation as unknown as Tree));

/** A key is defined when it exists as written or as a plural family (key_one, key_other…). */
const defined = (keys: Set<string>, key: string) => keys.has(key) || keys.has(`${key}_other`);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('translations', () => {
  it('has the same keys in English and Italian', () => {
    const base = (key: string) => key.replace(PLURAL, '');
    const missingInItalian = [...en].filter((key) => !italian.has(key) && !defined(italian, base(key)));
    const missingInEnglish = [...italian].filter((key) => !en.has(key) && !defined(en, base(key)));
    expect({ missingInItalian, missingInEnglish }).toEqual({ missingInItalian: [], missingInEnglish: [] });
  });

  it('defines every literal key used in the app', () => {
    const root = join(__dirname, '..', '..', '..', '..');
    const files = [...sourceFiles(join(root, 'app')), ...sourceFiles(join(root, 'src'))];
    const used = new Set<string>();
    for (const file of files) {
      // t('a.b') and t("a.b"); template keys with ${…} are built at runtime and skipped.
      for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*["']([a-zA-Z0-9_.]+)["']/g)) used.add(match[1]);
    }
    const missing = [...used].filter((key) => !defined(en, key) || !defined(italian, key)).sort();
    expect(missing).toEqual([]);
  });

  it('gives every counted phrase singular and plural forms', () => {
    // Units that read the same for one and many ("1 min", "5 s") need no plural form.
    const invariant = new Set(['mobility.minutes', 'mobility.seconds', 'mobility.estimated', 'progression.repeat']);
    const counted = (tree: Tree) => {
      const values = new Map<string, string>();
      const walk = (node: Tree, prefix: string) => Object.entries(node).forEach(([key, value]) => {
        if (typeof value === 'string') values.set(`${prefix}${key}`, value); else walk(value, `${prefix}${key}.`);
      });
      walk(tree, '');
      return [...values].filter(([key, value]) => value.includes('{{count}}') && !PLURAL.test(key) && !invariant.has(key)).map(([key]) => key);
    };
    expect(counted(resources.en.translation as unknown as Tree)).toEqual([]);
    expect(counted(resources.it.translation as unknown as Tree)).toEqual([]);
  });

  it('names every pose position, joint and reset scope', () => {
    const keys = [
      ...POSITIONS.flatMap((position) => [
        ...['name', 'how', 'metric'].map((field) => `pose.positions.${position.id}.${field}`),
        ...position.joints.flatMap((joint) => [`pose.jointsShort.${joint}`, `pose.joints.${joint}`]),
      ]),
      ...POSITION_GROUPS.map((group) => `pose.groups.${group}`),
      ...RESET_SCOPES.flatMap((scope) => [`reset.scopes.${scope}.title`, `reset.scopes.${scope}.body`]),
    ];
    expect(keys.filter((key) => !defined(en, key) || !defined(italian, key))).toEqual([]);
  });
});
