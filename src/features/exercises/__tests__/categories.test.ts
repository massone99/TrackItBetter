import { categoryIcons } from '../../../shared/components/categoryIcons';
import { resources } from '../../../shared/i18n/resources';
import { matchesScope } from '../../analytics/explore';
import type { CompletedSetRow } from '../../analytics/summary';
import { EXERCISE_CATEGORIES } from '../categories';
import { exerciseFormSchema } from '../exerciseForm';

// Node's fs is available under Jest; the app's tsconfig has no Node types, so it is typed here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: 'utf8') => string };
declare const __dirname: string;
const source = (path: string) => readFileSync(`${__dirname}/../${path}`, 'utf8');

describe('exercise categories', () => {
  it('include biceps and triceps beside the existing ones', () => {
    expect(EXERCISE_CATEGORIES).toEqual(expect.arrayContaining(['push', 'pull', 'biceps', 'triceps', 'legs', 'core', 'skill', 'mobility', 'cardio']));
    expect(new Set(EXERCISE_CATEGORIES).size).toBe(EXERCISE_CATEGORIES.length);
  });

  it.each(EXERCISE_CATEGORIES)('%s has its own icon and a label in both languages', (category) => {
    expect(categoryIcons[category]).toBeDefined();
    expect(resources.en.translation.library.category[category as keyof typeof resources.en.translation.library.category]).toEqual(expect.any(String));
    expect(resources.it.translation.library.category[category as keyof typeof resources.it.translation.library.category]).toEqual(expect.any(String));
  });

  it('uses distinct icons so categories can be told apart in lists', () => {
    const icons = EXERCISE_CATEGORIES.map((category) => categoryIcons[category]);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('are offered by the form, the library filter and the exercise picker from one list', () => {
    expect(exerciseFormSchema.shape.category.options).toEqual([...EXERCISE_CATEGORIES]);
    expect(source('LibraryView.tsx')).toContain('EXERCISE_CATEGORIES');
    expect(source('ExercisePicker.tsx')).toContain('EXERCISE_CATEGORIES');
  });

  it('count as strength training in statistics', () => {
    const row = { category: 'biceps', extraCategories: '[]', movementPattern: null, exerciseId: 'curl' } as CompletedSetRow;
    expect(matchesScope(row, { kind: 'strength' })).toBe(true);
    expect(matchesScope(row, { kind: 'all', category: 'biceps' })).toBe(true);
    expect(matchesScope({ ...row, category: 'triceps' }, { kind: 'strength', category: 'biceps' })).toBe(false);
  });
});
