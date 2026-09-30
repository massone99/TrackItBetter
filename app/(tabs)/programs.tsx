import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { nextSessionInRotation } from '../../src/domain/userProgram';
import { listRecentWorkoutNames } from '../../src/features/session/repository';
import { LibraryView } from '../../src/features/exercises/LibraryView';
import { programTemplates } from '../../src/features/programs/catalog';
import { listHiddenTemplates, setHiddenTemplates } from '../../src/features/programs/hiddenTemplates';
import { listUserPrograms, type UserProgram } from '../../src/features/programs/userPrograms';
import { ActionButton, EmptyState, IconButton, ListGroup, ListRow, PageHeading, Screen, SectionTitle, SegmentedControl, Text, Toast } from '../../src/shared/components/ui';
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
  const [hidden, setHidden] = useState<string[]>([]);
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [undo, setUndo] = useState<{ message: string; previous: string[] } | null>(null);
  const hideUndo = useCallback(() => setUndo(null), []);
  const language = i18n.language.startsWith('it') ? 'it' : 'en';

  useFocusEffect(useCallback(() => {
    let mounted = true;
    void Promise.all([listUserPrograms(), listHiddenTemplates(), listRecentWorkoutNames()]).then(([programs, hiddenIds, names]) => {
      if (!mounted) return;
      setMine(programs);
      setRecentNames(names);
      setHidden(hiddenIds);
    });
    return () => { mounted = false; };
  }, []));

  const updateHidden = (next: string[], message?: string) => {
    if (message) setUndo({ message, previous: hidden });
    setHidden(next);
    void setHiddenTemplates(next);
  };

  const templates = programTemplates.filter((template) => !hidden.includes(template.id));
  const hiddenCount = programTemplates.length - templates.length;

  return (
    <Screen
      overlay={(
        <Toast
          message={undo?.message ?? null}
          actionLabel={t('userProgram.undo')}
          onAction={() => { if (undo) updateHidden(undo.previous); }}
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

      {view === 'exercises' ? <LibraryView /> : (
        <>
          <SectionTitle title={t('userProgram.myPrograms')} />
          {mine && mine.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title={t('userProgram.create')}
              body={t('userProgram.myProgramsEmpty')}
              action={<View style={styles.emptyAction}><ActionButton icon="add" label={t('userProgram.create')} onPress={() => router.push('/program-builder')} /></View>}
            />
          ) : null}
          {mine && mine.length > 0 ? (
            <ListGroup>
              {mine.map((program) => {
                const next = nextSessionInRotation(program, recentNames);
                return (
                  <ListRow
                    key={program.id}
                    icon="calendar"
                    title={program.name}
                    subtitle={next ? `${t('userProgram.nextShort', { name: next.name })} · ${t('userProgram.daysPerWeek', { count: program.sessions.length })}` : t('userProgram.noWorkoutsYet')}
                    onPress={() => router.push({ pathname: '/program/user/[id]', params: { id: program.id } })}
                  />
                );
              })}
            </ListGroup>
          ) : null}

          <SectionTitle title={t('userProgram.templates')} />
          {templates.length > 0 ? (
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
          ) : (
            <Text style={[styles.muted, { color: palette.textMuted }]}>{t('programsTab.noTemplates')}</Text>
          )}
          {hiddenCount > 0 ? (
            <ActionButton
              icon="refresh"
              variant="ghost"
              label={t('programsTab.restoreTemplates', { count: hiddenCount })}
              onPress={() => updateHidden([])}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  emptyAction: { alignSelf: 'stretch', marginTop: 6 },
  muted: { fontFamily: fonts.body, fontSize: 14 },
});
