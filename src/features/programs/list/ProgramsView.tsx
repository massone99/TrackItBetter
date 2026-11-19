import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { filterPrograms, UNSET_FILTER, type ProgramStatus } from '../../../domain/programStructure';
import { type UserProgram } from '../../../domain/userProgram';
import { usePaged, ShowMore } from '../../../shared/components/paging';
import { Chip, EmptyState, Label, ListGroup, SectionTitle, TextField } from '../../../shared/components/ui';
import { PROGRAMS_BAREBONE_KEY, PROGRAMS_SORT_KEY, readPreference, writePreference } from '../../../shared/settings/preferences';
import { useBooleanPreference } from '../../../shared/settings/useBooleanPreference';
import { useInk } from '../../../shared/theme/ink';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { radii } from '../../../shared/theme/tokens';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';
import { ManageCategoriesSheet } from '../ManageCategoriesSheet';
import { ManageClustersSheet } from '../ManageClustersSheet';
import { ProgramClustersSheet } from '../ProgramClustersSheet';
import { type ProgramMetaKind } from '../ProgramMetaField';
import { ProgramMetaSheet } from '../ProgramMetaSheet';
import { createProgramCluster, deleteProgramCluster, deleteUserProgram, duplicateUserProgram, renameProgramAuthor, renameProgramCategory, renameProgramCluster, updateUserProgram } from '../userPrograms';
import { authorCounts, categoryCounts, clusterCounts, groupProgramsByCluster, isProgramSort, pickHero, programAuthors, programCategories, programClusters, sortPrograms, statusCounts, statusOf, visibleStatuses, type ProgramSort } from './derive';
import { ProgramActionsSheet, type ProgramAction } from './ProgramActionsSheet';
import { ProgramHero } from './ProgramHero';
import { ProgramRow } from './ProgramRow';
import { ProgramSortSheet } from './ProgramSortSheet';

/** Search appears once there are enough programs to need it. */
export const SEARCH_FROM = 6;
const PAGE = 15;

function readInitialSort(): ProgramSort {
  const saved = readPreference(PROGRAMS_SORT_KEY);
  if (saved === 'name') return 'nameAsc';
  return isProgramSort(saved) ? saved : 'recent';
}

function resolveOptionalFilter(selected: string | null, available: readonly string[], hasUnset: boolean): string | null {
  if (selected === UNSET_FILTER) return hasUnset ? UNSET_FILTER : null;
  return selected && available.includes(selected) ? selected : null;
}

/** The list of the person's programs: hero, search, status/category/author/cluster filters, sort, cluster grouping, barebone mode, paged rows, actions sheet. */
export function ProgramsView({ programs, savedClusters = [], recentNames, starting, onStartHero, onChanged, onNotice }: {
  programs: UserProgram[];
  savedClusters?: readonly string[];
  recentNames: readonly string[];
  starting: boolean;
  onStartHero: (program: UserProgram, sessionId: string) => void;
  onChanged: () => void;
  onNotice: (message: string) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const ink = useInk();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ProgramStatus>('active');
  const [category, setCategory] = useState<string | null>(null);
  const [author, setAuthor] = useState<string | null>(null);
  const [cluster, setCluster] = useState<string | null>(null);
  const [groupByCluster, setGroupByCluster] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<ProgramSort>(readInitialSort);
  const [sortOpen, setSortOpen] = useState(false);
  const [barebone, toggleBarebone] = useBooleanPreference(PROGRAMS_BAREBONE_KEY, false);
  const [target, setTarget] = useState<UserProgram | null>(null);
  const [metaTarget, setMetaTarget] = useState<{ program: UserProgram; kind: ProgramMetaKind } | null>(null);
  const [clusterTarget, setClusterTarget] = useState<UserProgram | null>(null);
  const [managingMeta, setManagingMeta] = useState<ProgramMetaKind | null>(null);
  const [managingClusters, setManagingClusters] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const counts = statusCounts(programs);
  const chips = visibleStatuses(counts);
  // A status that emptied out (the last paused program resumed) falls back to Active.
  const shownStatus = chips.includes(status) ? status : 'active';
  const statusPrograms = programs.filter((program) => statusOf(program) === shownStatus);

  const allCategories = programCategories(programs);
  const allCategoryCounts = categoryCounts(programs);
  const visibleCategories = programCategories(statusPrograms);
  const hasUncategorized = statusPrograms.some((program) => !program.category);
  const shownCategory = resolveOptionalFilter(category, visibleCategories, hasUncategorized);

  const allAuthors = programAuthors(programs);
  const allAuthorCounts = authorCounts(programs);
  const visibleAuthors = programAuthors(statusPrograms);
  const hasNoAuthor = statusPrograms.some((program) => !program.author);
  const shownAuthor = resolveOptionalFilter(author, visibleAuthors, hasNoAuthor);

  const allClusters = programClusters(programs, savedClusters);
  const allClusterCounts = clusterCounts(programs);
  const visibleClusters = programClusters(statusPrograms, savedClusters);
  const hasUnclustered = statusPrograms.some((program) => !program.clusters || program.clusters.length === 0);
  const shownCluster = resolveOptionalFilter(cluster, visibleClusters, hasUnclustered);

  const hasFilterOptions = visibleCategories.length > 0 || visibleAuthors.length > 0 || allClusters.length > 0;
  const activeFilterCount = (shownCategory ? 1 : 0) + (shownAuthor ? 1 : 0) + (shownCluster ? 1 : 0);

  const searching = programs.length >= SEARCH_FROM;
  const hasMatchesFilter = Boolean((searching && query.trim()) || shownCategory || shownAuthor || shownCluster);
  const filtered = filterPrograms(programs, searching ? query : '', shownStatus, shownCategory, shownAuthor, shownCluster);
  const rows = sortPrograms(filtered, sort, recentNames);
  const clusterGroups = groupByCluster ? groupProgramsByCluster(rows, allClusters) : [];
  const page = usePaged(rows, PAGE, `${shownStatus}|${shownCategory ?? ''}|${shownAuthor ?? ''}|${shownCluster ?? ''}|${sort}|${query}`);
  const hero = barebone || hasMatchesFilter || showFilters || groupByCluster ? null : pickHero(programs, recentNames);
  const now = new Date();

  const updateSort = (next: ProgramSort) => {
    setSort(next);
    writePreference(PROGRAMS_SORT_KEY, next);
  };

  const closeSheet = () => { setTarget(null); setConfirming(false); };
  const act = async (action: ProgramAction, program: UserProgram) => {
    closeSheet();
    if (action === 'category' || action === 'author') {
      setMetaTarget({ program, kind: action });
      return;
    }
    if (action === 'clusters') {
      setClusterTarget(program);
      return;
    }
    try {
      if (action === 'delete') {
        await deleteUserProgram(program.id);
        onNotice(t('programsList.deleted', { name: program.name }));
      } else if (action === 'duplicate') {
        await duplicateUserProgram(program.id, t('userProgram.copyName', { name: program.name }));
        onNotice(t('programsList.duplicated', { name: program.name }));
      } else {
        const next: ProgramStatus = action === 'pause' ? 'paused' : action === 'archive' ? 'archived' : 'active';
        await updateUserProgram(program.id, () => ({ status: next }));
        onNotice(t(`programsList.done.${action}`, { name: program.name }));
      }
    } catch {
      onNotice(t('programsList.actionError'));
    }
    onChanged();
  };

  const filterGroups = [
    visibleCategories.length > 0 ? {
      kind: 'category' as const,
      label: t('programCategory.label'),
      allLabel: t('programCategory.all'),
      unsetLabel: t('programCategory.uncategorized'),
      values: visibleCategories,
      hasUnset: hasUncategorized,
      selected: shownCategory,
      onSelect: setCategory,
    } : null,
    visibleAuthors.length > 0 ? {
      kind: 'author' as const,
      label: t('programAuthor.label'),
      allLabel: t('programAuthor.all'),
      unsetLabel: t('programAuthor.none'),
      values: visibleAuthors,
      hasUnset: hasNoAuthor,
      selected: shownAuthor,
      onSelect: setAuthor,
      onManage: () => setManagingMeta('author'),
    } : null,
    allClusters.length > 0 ? {
      kind: 'cluster' as const,
      label: t('programCluster.label'),
      allLabel: t('programCluster.all'),
      unsetLabel: t('programCluster.unclustered'),
      values: visibleClusters,
      hasUnset: hasUnclustered,
      selected: shownCluster,
      onSelect: setCluster,
      onManage: () => setManagingClusters(true),
    } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <>
      {hero ? (
        <ProgramHero
          program={hero.program}
          next={hero.next}
          recentNames={recentNames}
          starting={starting}
          onOpen={() => router.push({ pathname: '/program/user/[id]', params: { id: hero.program.id } })}
          onStart={() => onStartHero(hero.program, hero.next.id)}
        />
      ) : null}

      {searching ? (
        <TextField
          placeholder={t('programsList.search', { count: programs.length })}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      ) : null}

      <View style={styles.chips}>
        {chips.map((item) => (
          <Chip key={item} label={`${t(`programsList.status.${item}`)} ${counts[item]}`} selected={item === shownStatus} onPress={() => setStatus(item)} />
        ))}
      </View>

      <View style={styles.chips}>
        {hasFilterOptions ? (
          <Chip
            icon="options-outline"
            label={activeFilterCount > 0 ? t('programsList.filtersActive', { count: activeFilterCount }) : t('programsList.filters')}
            selected={showFilters || activeFilterCount > 0}
            onPress={() => setShowFilters((open) => !open)}
          />
        ) : null}
        <Chip
          icon="swap-vertical-outline"
          label={`${t('programsList.sort')}: ${t(`programsList.sortOptions.${sort}`)}`}
          selected={sort !== 'recent'}
          onPress={() => setSortOpen(true)}
        />
        <Chip
          icon="list-outline"
          label={t('programsList.barebone')}
          selected={barebone}
          onPress={() => toggleBarebone()}
        />
        <Chip
          icon="folder-outline"
          label={t('programCluster.groupView')}
          selected={groupByCluster}
          onPress={() => setGroupByCluster((open) => !open)}
        />
        <Chip
          icon="create-outline"
          label={t('programCluster.manageTitle')}
          onPress={() => setManagingClusters(true)}
        />
      </View>

      {showFilters && filterGroups.length > 0 ? (
        <View style={[styles.filterBox, { borderColor: ink, backgroundColor: palette.surface }]}>
          {filterGroups.map((group) => (
            <View key={group.kind} style={styles.filterGroup}>
              <Label>{group.label}</Label>
              <View style={styles.chips}>
                <Chip label={group.allLabel} selected={group.selected === null} onPress={() => group.onSelect(null)} />
                {group.values.map((item) => (
                  <Chip key={item} label={item} selected={group.selected === item} onPress={() => group.onSelect(group.selected === item ? null : item)} />
                ))}
                {group.hasUnset ? (
                  <Chip
                    label={group.unsetLabel}
                    selected={group.selected === UNSET_FILTER}
                    onPress={() => group.onSelect(group.selected === UNSET_FILTER ? null : UNSET_FILTER)}
                  />
                ) : null}
                <Chip icon="create-outline" label={t('programCategory.manage')} onPress={() => ('onManage' in group && group.onManage ? group.onManage() : setManagingMeta(group.kind as ProgramMetaKind))} />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {rows.length > 0 ? (
        groupByCluster ? (
          <View style={styles.clusterList}>
            {clusterGroups.map((group) => (
              <View key={group.cluster ?? '__unclustered__'} style={styles.clusterGroup}>
                <SectionTitle
                  title={`${group.cluster ?? t('programCluster.unclustered')} (${group.programs.length})`}
                />
                <ListGroup>
                  {group.programs.map((program) => (
                    <ProgramRow
                      key={`${group.cluster ?? 'none'}-${program.id}`}
                      program={program}
                      recentNames={recentNames}
                      now={now}
                      barebone={barebone}
                      onOpen={() => router.push({ pathname: '/program/user/[id]', params: { id: program.id } })}
                      onActions={() => setTarget(program)}
                    />
                  ))}
                </ListGroup>
              </View>
            ))}
          </View>
        ) : (
          <>
            <ListGroup>
              {page.shown.map((program) => (
                <ProgramRow
                  key={program.id}
                  program={program}
                  recentNames={recentNames}
                  now={now}
                  barebone={barebone}
                  onOpen={() => router.push({ pathname: '/program/user/[id]', params: { id: program.id } })}
                  onActions={() => setTarget(program)}
                />
              ))}
            </ListGroup>
            <ShowMore remaining={page.remaining} onPress={page.more} />
          </>
        )
      ) : (
        <EmptyState
          icon="search-outline"
          title={hasMatchesFilter ? t('programsList.noMatches') : t('programsList.noneInStatus', { status: t(`programsList.status.${shownStatus}`).toLocaleLowerCase() })}
          body={hasMatchesFilter ? t('programsList.noMatchesBody') : t('programsList.noneInStatusBody')}
        />
      )}

      <ProgramSortSheet visible={sortOpen} sort={sort} onSelect={updateSort} onClose={() => setSortOpen(false)} />
      <ProgramActionsSheet program={target} confirmingDelete={confirming} onAsk={() => setConfirming(true)} onAction={(action, program) => void act(action, program)} onClose={closeSheet} />

      {metaTarget ? (
        <ProgramMetaSheet
          key={`${metaTarget.program.id}-${metaTarget.kind}`}
          kind={metaTarget.kind}
          visible
          programName={metaTarget.program.name}
          initialValue={metaTarget.kind === 'category' ? metaTarget.program.category : metaTarget.program.author}
          existing={metaTarget.kind === 'category' ? allCategories : allAuthors}
          onClose={() => setMetaTarget(null)}
          onSave={(nextValue) => {
            const { program, kind } = metaTarget;
            setMetaTarget(null);
            void (async () => {
              try {
                await updateUserProgram(program.id, () => (kind === 'category' ? { category: nextValue } : { author: nextValue }));
                onNotice(t(kind === 'category' ? 'programCategory.saved' : 'programAuthor.saved'));
                onChanged();
              } catch {
                onNotice(t('programsList.actionError'));
              }
            })();
          }}
        />
      ) : null}

      {managingMeta ? (
        <ManageCategoriesSheet
          kind={managingMeta}
          visible
          categories={managingMeta === 'category' ? allCategories : allAuthors}
          counts={managingMeta === 'category' ? allCategoryCounts : allAuthorCounts}
          onClose={() => setManagingMeta(null)}
          onRename={(from, to) => {
            const kind = managingMeta;
            void (async () => {
              try {
                await (kind === 'category' ? renameProgramCategory(from, to) : renameProgramAuthor(from, to));
                if (kind === 'category' && category === from) setCategory(to);
                if (kind === 'author' && author === from) setAuthor(to);
                onNotice(t(kind === 'category' ? 'programCategory.renamed' : 'programAuthor.renamed'));
                onChanged();
              } catch {
                onNotice(t('programsList.actionError'));
              }
            })();
          }}
          onRemove={(targetValue) => {
            const kind = managingMeta;
            void (async () => {
              try {
                await (kind === 'category' ? renameProgramCategory(targetValue, null) : renameProgramAuthor(targetValue, null));
                if (kind === 'category' && category === targetValue) setCategory(null);
                if (kind === 'author' && author === targetValue) setAuthor(null);
                onNotice(t(kind === 'category' ? 'programCategory.removed' : 'programAuthor.removed'));
                onChanged();
              } catch {
                onNotice(t('programsList.actionError'));
              }
            })();
          }}
        />
      ) : null}
      {managingClusters ? (
        <ManageClustersSheet
          visible
          clusters={allClusters}
          counts={allClusterCounts}
          onClose={() => setManagingClusters(false)}
          onCreate={(name) => {
            void (async () => {
              try {
                await createProgramCluster(name);
                onNotice(t('programCluster.created'));
                onChanged();
              } catch {
                onNotice(t('programsList.actionError'));
              }
            })();
          }}
          onRename={(from, to) => {
            void (async () => {
              try {
                await renameProgramCluster(from, to);
                if (cluster === from) setCluster(to);
                onNotice(t('programCluster.renamed'));
                onChanged();
              } catch {
                onNotice(t('programsList.actionError'));
              }
            })();
          }}
          onRemove={(name) => {
            void (async () => {
              try {
                await deleteProgramCluster(name);
                if (cluster === name) setCluster(null);
                onNotice(t('programCluster.deleted'));
                onChanged();
              } catch {
                onNotice(t('programsList.actionError'));
              }
            })();
          }}
        />
      ) : null}

      {clusterTarget ? (
        <ProgramClustersSheet
          key={clusterTarget.id}
          visible
          programName={clusterTarget.name}
          selectedClusters={clusterTarget.clusters ?? []}
          allClusters={allClusters}
          onClose={() => setClusterTarget(null)}
          onCreateCluster={(name) => {
            void createProgramCluster(name).then(() => onChanged());
          }}
          onSave={(nextClusters) => {
            const program = clusterTarget;
            setClusterTarget(null);
            void (async () => {
              try {
                await updateUserProgram(program.id, () => ({ clusters: nextClusters.length > 0 ? nextClusters : undefined }));
                onNotice(t('programCluster.saved'));
                onChanged();
              } catch {
                onNotice(t('programsList.actionError'));
              }
            })();
          }}
        />
      ) : null}
    </>
  );
}

const baseStyles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterBox: { borderWidth: 1, borderRadius: radii.surface, padding: 12, gap: 12 },
  filterGroup: { gap: 6 },
  clusterList: { gap: 16 },
  clusterGroup: { gap: 8 },
});
