import { LoadError } from '../../src/shared/components/LoadError';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { getActiveWorkout, listRecentWorkoutNames } from '../../src/features/session/repository';
import { WorkoutInProgressSheet } from '../../src/features/session/WorkoutInProgressSheet';
import { ProgramsView as MyPrograms } from '../../src/features/programs/list/ProgramsView';
import { startUserProgramSession } from '../../src/features/programs/startUserSession';
import { LibraryView } from '../../src/features/exercises/LibraryView';
import { programTemplates } from '../../src/features/programs/catalog';
import { listHiddenTemplates, setHiddenTemplates } from '../../src/features/programs/hiddenTemplates';
import { listUserPrograms, type UserProgram } from '../../src/features/programs/userPrograms';
import { ActionButton, EmptyState, Icon, IconButton, ListGroup, ListRow, PageHeading, Screen, SectionTitle, SegmentedControl, Tag, Text, Toast, tapFeedback } from '../../src/shared/components/ui';
import i18n from '../../src/shared/i18n';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';

type ProgramsView = 'programs' | 'exercises';

/** Training plans and the exercise library: everything used to prepare a session. */
export default function ProgramsTab() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const params = useLocalSearchParams<{ view?: string }>();
  // The view lives in the URL, so a link (e.g. back from an exercise) can open either one.
  const view: ProgramsView = params.view === 'exercises' ? 'exercises' : 'programs';
  const [mine, setMine] = useState<UserProgram[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [undo, setUndo] = useState<{ message: string; previous: string[] | null } | null>(null);
  const [active, setActive] = useState<{ id: string; name: string } | null>(null);
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const hideUndo = useCallback(() => setUndo(null), []);
  const language = i18n.language.startsWith('it') ? 'it' : 'en';

  const load = useCallback(async () => {
    try {
      const [programs, hiddenIds, names, activeWorkout] = await Promise.all([listUserPrograms(), listHiddenTemplates(), listRecentWorkoutNames(), getActiveWorkout()]);
      setMine(programs);
      setActive(activeWorkout ? { id: activeWorkout.id, name: activeWorkout.name } : null);
      setRecentNames(names);
      setHidden(hiddenIds);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const updateHidden = (next: string[], message?: string) => {
    if (message) setUndo({ message, previous: hidden });
    setHidden(next);
    void setHiddenTemplates(next);
  };

  const startHero = async (program: UserProgram, sessionId: string) => {
    if (starting) return;
    if (active) { setBlockedBy(active); return; }
    const session = program.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    setStarting(true);
    try {
      const workoutId = await startUserProgramSession(program, session);
      router.push({ pathname: '/workout/[id]', params: { id: workoutId } });
    } catch (reason) {
      setUndo({ message: `${t('programBuilder.startError')} (${reason instanceof Error ? reason.message : String(reason)})`, previous: null });
    } finally {
      setStarting(false);
    }
  };

  const templates = programTemplates.filter((template) => !hidden.includes(template.id));
  const hiddenCount = programTemplates.length - templates.length;

  return (
    <Screen
      overlay={(
        <Toast
          message={undo?.message ?? null}
          actionLabel={undo?.previous ? t('userProgram.undo') : undefined}
          onAction={() => { if (undo?.previous) updateHidden(undo.previous); }}
          onHide={hideUndo}
        />
      )}
    >
      <PageHeading
        title={t('programsTab.title')}
        subtitle={view === 'programs' ? t('programsTab.subtitle') : t('library.subtitle')}
        action={view === 'programs'
          ? <IconButton icon="add" tone="accent" label={t('userProgram.create')} onPress={() => router.push('/program-builder')} />
          : <IconButton icon="add" tone="accent" label={t('library.createCustom')} onPress={() => router.push('/exercise/new')} />}
      />
      <SegmentedControl<ProgramsView>
        value={view}
        onChange={(next) => router.setParams({ view: next })}
        options={[{ value: 'programs', label: t('programsTab.programs') }, { value: 'exercises', label: t('programsTab.exercises') }]}
      />

      {view === 'exercises' ? (
        <>
          <ListGroup>
            <ListRow icon="git-network-outline" title={t('chains.allTitle')} subtitle={t('chains.allSubtitle')} onPress={() => router.push('/progressions')} />
          </ListGroup>
          <LibraryView />
        </>
      ) : (
        <>
          <SectionTitle title={t('userProgram.myPrograms')} />
          {loadFailed ? <LoadError onRetry={() => void load()} /> : null}
          {mine === null && !loadFailed ? <ActivityIndicator color={palette.accentStrong} /> : null}
          {mine && mine.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title={t('userProgram.create')}
              body={t('userProgram.myProgramsEmpty')}
              action={<View style={styles.emptyAction}><ActionButton icon="add" label={t('userProgram.create')} onPress={() => router.push('/program-builder')} /></View>}
            />
          ) : null}
          {mine && mine.length > 0 ? (
            <MyPrograms
              programs={mine}
              recentNames={recentNames}
              starting={starting}
              onStartHero={(program, sessionId) => void startHero(program, sessionId)}
              onChanged={() => void load()}
              onNotice={(message) => setUndo({ message, previous: null })}
            />
          ) : null}

          <ActionButton icon="document-outline" variant="ghost" label={t('importJson.programsAction')} onPress={() => router.push('/import-json')} />

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showTemplates }}
            accessibilityLabel={t('programsList.templates', { count: programTemplates.length })}
            onPress={() => { tapFeedback(); setShowTemplates(!showTemplates); }}
            style={[styles.templatesLink, { borderTopColor: palette.border }]}
          >
            <Tag color={palette.textMuted}>{t('programsList.templates', { count: programTemplates.length })}</Tag>
            <Icon name={showTemplates ? 'chevron-down' : 'arrow-forward'} size={16} color={palette.textMuted} />
          </Pressable>
          {showTemplates && templates.length > 0 ? (
            <ListGroup>
              {templates.map((template) => (
                <ListRow
                  key={template.id}
                  icon="copy-outline"
                  tint={palette.textMuted}
                  title={template.name[language]}
                  subtitle={template.frequency[language]}
                  onPress={() => router.push({ pathname: '/program/[id]', params: { id: template.id } })}
                  trailing={(
                    <IconButton
                      icon="trash-outline"
                      tone="plain"
                      size={36}
                      label={t('programsTab.hideTemplate', { name: template.name[language] })}
                      onPress={() => updateHidden([...hidden, template.id], t('programsTab.templateHidden', { name: template.name[language] }))}
                    />
                  )}
                />
              ))}
            </ListGroup>
          ) : showTemplates ? (
            <Text style={[styles.muted, { color: palette.textMuted }]}>{t('programsTab.noTemplates')}</Text>
          ) : null}
          {showTemplates && hiddenCount > 0 ? (
            <ActionButton
              icon="refresh"
              variant="ghost"
              label={t('programsTab.restoreTemplates', { count: hiddenCount })}
              onPress={() => updateHidden([])}
            />
          ) : null}
        </>
      )}
      <WorkoutInProgressSheet active={blockedBy} onClose={() => setBlockedBy(null)} />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  emptyAction: { alignSelf: 'stretch', marginTop: 6 },
  templatesLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  muted: { fontFamily: fonts.body, fontSize: 14 },
});
