import { resources } from '../resources';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

describe('translations', () => {
  it('defines the same keys in English and Italian', () => {
    const english = keys(resources.en.translation).map((key) => key.replace(/_(one|other)$/, '')).sort();
    const italian = keys(resources.it.translation).map((key) => key.replace(/_(one|other)$/, '')).sort();
    expect(italian.filter((key) => !english.includes(key))).toEqual([]);
    expect(english.filter((key) => !italian.includes(key))).toEqual([]);
  });
});
