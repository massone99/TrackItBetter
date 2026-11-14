import { filterPrograms, UNCATEGORIZED_FILTER, UNSET_FILTER } from '../../../domain/programStructure';
import { normalizeAuthor, normalizeCategory, type UserProgram } from '../../../domain/userProgram';
import { authorCounts, categoryCounts, programAuthors, programCategories, sortPrograms } from '../list/derive';

function makeProgram(overrides: Partial<UserProgram> & { id: string; name: string }): UserProgram {
  return {
    sessions: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('program categories, authors, filtering, and sorting', () => {
  const session = (id: string, name: string) => ({ id, name, exercises: [] });
  const programs: UserProgram[] = [
    makeProgram({
      id: '1',
      name: 'Upper Lower',
      status: 'active',
      category: 'Strength',
      author: 'Coach A',
      lastUsedAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-03T10:00:00.000Z',
      sessions: [session('s1', 'Upper'), session('s2', 'Lower')],
    }),
    makeProgram({
      id: '2',
      name: 'Morning Flow',
      status: 'active',
      category: 'Mobility',
      author: 'Tom Merrick',
      lastUsedAt: '2026-05-04T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
      sessions: [session('s3', 'Flow')],
    }),
    makeProgram({
      id: '3',
      name: 'Push Pull',
      status: 'active',
      category: 'Strength',
      author: 'Coach A',
      lastUsedAt: null,
      updatedAt: '2026-05-05T10:00:00.000Z',
      sessions: [session('s4', 'Push'), session('s5', 'Pull'), session('s6', 'Legs')],
    }),
    makeProgram({
      id: '4',
      name: 'Quick Routine',
      status: 'active',
      category: null,
      author: null,
      lastUsedAt: '2026-05-02T10:00:00.000Z',
      updatedAt: '2026-05-02T10:00:00.000Z',
      sessions: [session('s7', 'Quick')],
    }),
    makeProgram({
      id: '5',
      name: 'Old Plan',
      status: 'archived',
      category: 'Rehab',
      author: 'Physio',
      updatedAt: '2026-04-01T10:00:00.000Z',
      sessions: [],
    }),
  ];

  it('normalizes category and author strings', () => {
    expect(normalizeCategory('  Strength  ')).toBe('Strength');
    expect(normalizeCategory('   ')).toBeNull();
    expect(normalizeCategory('x'.repeat(50))).toHaveLength(40);
    expect(normalizeAuthor('  Tom Merrick  ')).toBe('Tom Merrick');
    expect(normalizeAuthor('')).toBeNull();
    expect(normalizeAuthor('y'.repeat(80))).toHaveLength(60);
  });

  it('extracts sorted unique categories and authors with counts', () => {
    expect(programCategories(programs)).toEqual(['Mobility', 'Rehab', 'Strength']);
    expect(categoryCounts(programs).get('Strength')).toBe(2);
    expect(programAuthors(programs)).toEqual(['Coach A', 'Physio', 'Tom Merrick']);
    expect(authorCounts(programs).get('Coach A')).toBe(2);
  });

  it('filters programs by category, author, unset values, and text query', () => {
    expect(filterPrograms(programs, '', 'active', 'Strength').map((p) => p.id)).toEqual(['1', '3']);
    expect(filterPrograms(programs, '', 'active', UNCATEGORIZED_FILTER).map((p) => p.id)).toEqual(['4']);
    expect(filterPrograms(programs, '', 'active', null, 'Coach A').map((p) => p.id)).toEqual(['1', '3']);
    expect(filterPrograms(programs, '', 'active', null, UNSET_FILTER).map((p) => p.id)).toEqual(['4']);
    expect(filterPrograms(programs, '', 'active', 'Strength', 'Coach A').map((p) => p.id)).toEqual(['1', '3']);
    expect(filterPrograms(programs, 'merrick', 'active').map((p) => p.id)).toEqual(['2']);
  });

  it('sorts programs across all sort options', () => {
    const active = programs.filter((p) => p.status === 'active');
    expect(sortPrograms(active, 'recent').map((p) => p.id)).toEqual(['2', '4', '1', '3']);
    expect(sortPrograms(active, 'updated').map((p) => p.id)).toEqual(['3', '1', '4', '2']);
    expect(sortPrograms(active, 'nameAsc').map((p) => p.id)).toEqual(['2', '3', '4', '1']);
    expect(sortPrograms(active, 'nameDesc').map((p) => p.id)).toEqual(['1', '4', '3', '2']);
    expect(sortPrograms(active, 'workoutsDesc').map((p) => p.id)).toEqual(['3', '1', '2', '4']);
    expect(sortPrograms(active, 'workoutsAsc').map((p) => p.id)).toEqual(['2', '4', '1', '3']);
    expect(sortPrograms(active, 'category').map((p) => p.id)).toEqual(['2', '3', '1', '4']);
    expect(sortPrograms(active, 'author').map((p) => p.id)).toEqual(['3', '1', '2', '4']);

    // Progress: Upper Lower has 1/2 (0.5), Morning Flow has 1/1 (1.0), Push Pull has 0/3 (0.0)
    const recentNames = ['Upper Lower · Upper', 'Morning Flow · Flow'];
    expect(sortPrograms(active, 'progress', recentNames).map((p) => p.id)).toEqual(['2', '1', '3', '4']);
  });
});
