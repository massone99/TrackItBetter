import { LoadError } from '../../src/shared/components/LoadError';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { getActiveWorkout, listRecentWorkoutNames } from '../../src/features/session/repository';
import { useStartGuard } from '../../src/features/session/useStartGuard';
import { ProgramsView as MyPrograms } from '../../src/features/programs/list/ProgramsView';
import { startUserProgramSession } from '../../src/features/programs/startUserSession';
import { LibraryView } from '../../src/features/exercises/LibraryView';
import { programTemplates } from '../../src/features/programs/catalog';
import { listHiddenTemplates, setHiddenTemplates } from '../../src/features/programs/hiddenTemplates';
import { listProgramClusters, listUserPrograms, type UserProgram } from '../../src/features/programs/userPrograms';
import { ActionButton, EmptyState, IconButton, Label, ListGroup, ListRow, PageHeading, Screen, SegmentedControl, Sheet, Text, Toast, tapFeedback } from '../../src/shared/components/ui';
import { useInk } from '../../src/shared/theme/ink';
import { radii, spacing } from '../../src/shared/theme/tokens';
import i18n from '../../src/shared/i18n';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';

type ProgramsView = 'programs' | 'exercises';

/** Distinct workouts of a template (a 3-day plan that repeats Workout A counts it once). */
function uniqueSessions(template: (typeof programTemplates)[number]): number {
  return new Set(template.sessions.map((session) => session.name.en)).size;
}

/** Training plans and the exercise library: everything used to prepare a session. */
export default function ProgramsTab() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const ink = useInk();
  const params = useLocalSearchParams<{ view?: string }>();
  // The view lives in the URL, so a link (e.g. back from an exercise) can open either one.
  const view: ProgramsView = params.view === 'exercises' ? 'exercises' : 'programs';
  const [mine, setMine] = useState<UserProgram[] | null>(null);
  const [savedClusters, setSavedClusters] = useState<string[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [undo, setUndo] = useState<{ message: string; previous: string[] | null } | null>(null);
  const [active, setActive] = useState<{ id: string; name: string } | null>(null);
  const { block, sheet } = useStartGuard();
  const [starting, setStarting] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const go = (action: () => void) => { setCreateOpen(false); action(); };
  const hideUndo = useCallback(() => setUndo(null), []);
  const language = i18n.language.startsWith('it') ? 'it' : 'en';

  const load = useCallback(async () => {
    try {
      const [programs, clusters, hiddenIds, names, activeWorkout] = await Promise.all([
        listUserPrograms(),
        typeof listProgramClusters === 'function' ? listProgramClusters() : Promise.resolve([]),
        listHiddenTemplates(),
        listRecentWorkoutNames(),
        getActiveWorkout(),
      ]);
      setMine(programs);
      setSavedClusters(clusters);
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

  // `force` skips the check of the open workout once the user has discarded it (`active` is only reloaded later).
  const startHero = async (program: UserProgram, sessionId: string, force = false) => {
    if (starting) return;
    if (active && !force) { block(active, () => void startHero(program, sessionId, true)); return; }
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
        action={<IconButton icon="add" tone="accent" label={t('simple.createTitle')} onPress={() => setCreateOpen(true)} />}
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
            <>
              <MyPrograms
                programs={mine}
                savedClusters={savedClusters}
                recentNames={recentNames}
                starting={starting}
                onStartHero={(program, sessionId) => void startHero(program, sessionId)}
                onChanged={() => void load()}
                onNotice={(message) => setUndo({ message, previous: null })}
              />
            </>
          ) : null}

          <View style={styles.shelfHeader}>
            <Label style={[styles.flex, { color: palette.text }]}>{t('simple.templates')}</Label>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showTemplates }} onPress={() => { tapFeedback(); setShowTemplates(!showTemplates); }} style={styles.shelfLink}>
              <Text style={[styles.shelfLinkText, { color: palette.accentStrong }]}>{showTemplates ? t('simple.hideTemplates') : t('simple.allTemplates', { count: programTemplates.length })}</Text>
            </Pressable>
          </View>
          {!showTemplates && templates.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
              {templates.map((template) => (
                <Pressable
                  key={template.id}
                  accessibilityRole="button"
                  onPress={() => { tapFeedback(); router.push({ pathname: '/program/[id]', params: { id: template.id } }); }}
                  style={({ pressed }) => [styles.templateCard, { borderColor: ink, backgroundColor: pressed ? palette.surfaceMuted : palette.surface }]}
                >
                  <Text style={[styles.templateName, { color: palette.text }]}>{template.name[language]}</Text>
                  <Label>{t('programsList.workouts', { count: uniqueSessions(template) })}</Label>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
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
      <Sheet visible={createOpen} onClose={() => setCreateOpen(false)} title={t('simple.createTitle')}>
        <Label>{t('simple.programGroup')}</Label>
        <ListGroup>
          <ListRow icon="add" title={t('simple.buildProgram')} subtitle={t('simple.buildProgramBody')} onPress={() => go(() => router.push('/program-builder'))} />
          <ListRow icon="copy-outline" title={t('simple.fromTemplate')} subtitle={t('simple.fromTemplateBody', { count: programTemplates.length })} onPress={() => go(() => { router.setParams({ view: 'programs' }); setShowTemplates(true); })} />
          <ListRow icon="document-outline" title={t('simple.importJson')} subtitle={t('simple.importJsonBody')} onPress={() => go(() => router.push('/import-json'))} />
        </ListGroup>
        <Label>{t('simple.libraryGroup')}</Label>
        <ListGroup>
          <ListRow icon="barbell-outline" title={t('simple.newExercise')} subtitle={t('simple.newExerciseBody')} onPress={() => go(() => router.push('/exercise/new'))} />
          <ListRow icon="git-network-outline" title={t('simple.newChain')} subtitle={t('simple.newChainBody')} onPress={() => go(() => router.push('/progressions'))} />
        </ListGroup>
      </Sheet>
      {sheet}
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  emptyAction: { alignSelf: 'stretch', marginTop: 6 },
  flex: { flex: 1 },
  shelfHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: -6 },
  shelfLink: { minHeight: 48, justifyContent: 'center', paddingLeft: spacing.sm },
  shelfLinkText: { fontFamily: fonts.monoSemibold, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase' },
  shelf: { gap: spacing.sm, paddingRight: spacing.lg },
  templateCard: { width: 150, minHeight: 96, padding: spacing.md, borderWidth: 1, borderRadius: radii.surface, justifyContent: 'space-between', gap: spacing.sm },
  templateName: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  muted: { fontFamily: fonts.body, fontSize: 14 },
});
