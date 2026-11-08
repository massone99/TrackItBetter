import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { filterPrograms, type ProgramStatus } from '../../../domain/programStructure';
import { type UserProgram } from '../../../domain/userProgram';
import { usePaged, ShowMore } from '../../../shared/components/paging';
import { Chip, EmptyState, ListGroup, Text, TextField } from '../../../shared/components/ui';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { fonts } from '../../../shared/theme/typography';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';
import { duplicateUserProgram, deleteUserProgram, updateUserProgram } from '../userPrograms';
import { pickHero, sortPrograms, statusCounts, visibleStatuses, type ProgramSort } from './derive';
import { ProgramActionsSheet, type ProgramAction } from './ProgramActionsSheet';
import { ProgramHero } from './ProgramHero';
import { ProgramRow } from './ProgramRow';

/** Search appears once there are enough programs to need it. */
export const SEARCH_FROM = 6;
const PAGE = 15;

/** The list of the person's programs: hero, search, status chips, sort, dense paged rows, actions sheet. */
export function ProgramsView({ programs, recentNames, starting, onStartHero, onChanged, onNotice }: {
  programs: UserProgram[];
  recentNames: readonly string[];
  starting: boolean;
  onStartHero: (program: UserProgram, sessionId: string) => void;
  onChanged: () => void;
  onNotice: (message: string) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ProgramStatus>('active');
  const [sort, setSort] = useState<ProgramSort>('recent');
  const [target, setTarget] = useState<UserProgram | null>(null);
  const [confirming, setConfirming] = useState(false);

  const counts = statusCounts(programs);
  const chips = visibleStatuses(counts);
  // A status that emptied out (the last paused program resumed) falls back to Active.
  const shownStatus = chips.includes(status) ? status : 'active';
  const searching = programs.length >= SEARCH_FROM;
  const rows = sortPrograms(filterPrograms(programs, searching ? query : '', shownStatus), sort);
  const page = usePaged(rows, PAGE, `${shownStatus}|${sort}|${query}`);
  const hero = pickHero(programs, recentNames);
  const now = new Date();

  const closeSheet = () => { setTarget(null); setConfirming(false); };
  const act = async (action: ProgramAction, program: UserProgram) => {
    closeSheet();
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
      <View style={styles.sortRow}>
        <Text style={[styles.sortLabel, { color: palette.textMuted }]}>{t('programsList.sort')}</Text>
        <Chip label={t('programsList.sortRecent')} selected={sort === 'recent'} onPress={() => setSort('recent')} />
        <Chip label={t('programsList.sortName')} selected={sort === 'name'} onPress={() => setSort('name')} />
      </View>

      {rows.length > 0 ? (
        <>
          <ListGroup>
            {page.shown.map((program) => (
              <ProgramRow
                key={program.id}
                program={program}
                recentNames={recentNames}
                now={now}
                onOpen={() => router.push({ pathname: '/program/user/[id]', params: { id: program.id } })}
                onActions={() => setTarget(program)}
              />
            ))}
          </ListGroup>
          <ShowMore remaining={page.remaining} onPress={page.more} />
        </>
      ) : (
        <EmptyState
          icon="search-outline"
          title={query.trim() ? t('programsList.noMatches') : t('programsList.noneInStatus', { status: t(`programsList.status.${shownStatus}`).toLocaleLowerCase() })}
          body={query.trim() ? t('programsList.noMatchesBody') : t('programsList.noneInStatusBody')}
        />
      )}

      <ProgramActionsSheet program={target} confirmingDelete={confirming} onAsk={() => setConfirming(true)} onAction={(action, program) => void act(action, program)} onClose={closeSheet} />
    </>
  );
}

const baseStyles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  sortLabel: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
});
