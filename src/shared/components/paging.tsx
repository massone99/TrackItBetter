import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionButton } from './ui';

/**
 * Long lists render in pages: the first `pageSize` items, then "Show more" adds a page. A new
 * `resetKey` (a search, a filter, another day) starts again from the first page.
 */
export function usePaged<T>(items: readonly T[], pageSize: number, resetKey: unknown = null) {
  const [state, setState] = useState({ key: resetKey, count: pageSize });
  const count = Object.is(state.key, resetKey) ? state.count : pageSize;
  return {
    shown: items.slice(0, count),
    remaining: Math.max(0, items.length - count),
    more: () => setState({ key: resetKey, count: count + pageSize }),
  };
}

/** "Show more · 120 left", only while something is left. */
export function ShowMore({ remaining, onPress }: { remaining: number; onPress: () => void }) {
  const { t } = useTranslation();
  if (remaining <= 0) return null;
  return <ActionButton variant="ghost" icon="chevron-down" label={t('common.showMoreCount', { count: remaining })} onPress={onPress} />;
}

/**
 * Pages grouped lists by their items, not their groups: the first `pageSize` items across the groups
 * in order (the last group shown may be cut), with the group's full size kept for its header.
 */
export function usePagedSections<S extends { items: readonly unknown[] }>(sections: readonly S[], pageSize: number, resetKey: unknown = null) {
  const total = sections.reduce((sum, section) => sum + section.items.length, 0);
  const counter = usePaged(Array.from({ length: total }), pageSize, resetKey);
  let left = counter.shown.length;
  const shown: (S & { total: number })[] = [];
  for (const section of sections) {
    if (left <= 0) break;
    shown.push({ ...section, total: section.items.length, items: section.items.slice(0, left) });
    left -= section.items.length;
  }
  return { shown, remaining: counter.remaining, more: counter.more };
}

/** `usePaged` as a component, for lists rendered below an early return or inside a branch. */
export function Paged<T>({ items, pageSize, resetKey = null, children }: {
  items: readonly T[];
  pageSize: number;
  resetKey?: unknown;
  children: (shown: T[]) => ReactNode;
}) {
  const page = usePaged(items, pageSize, resetKey);
  return <>{children(page.shown)}<ShowMore remaining={page.remaining} onPress={page.more} /></>;
}
