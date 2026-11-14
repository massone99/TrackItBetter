import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { disciplineOf, type ProgramDiscipline, type UserProgram } from '../../domain/userProgram';
import { listHiddenTemplates, setHiddenTemplates } from './hiddenTemplates';
import { ProgramsView } from './list/ProgramsView';
import { programTemplates } from './catalog';
import { startUserProgramSession } from './startUserSession';
import { listProgramClusters, listUserPrograms } from './userPrograms';
import { WorkoutInProgressSheet } from '../session/WorkoutInProgressSheet';
import { getActiveWorkout, listRecentWorkoutNames } from '../session/repository';
import { LoadError } from '../../shared/components/LoadError';
import {
  ActionButton,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  ListGroup,
  ListRow,
  PageHeading,
  Screen,
  Tag,
  tapFeedback,
  Text,
  Toast,
} from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

/** Dedicated page for either Strength programs or Mobility programs, with custom clusters and quick cross-navigation. */
export function ProgramsDisciplineScreen({ discipline }: { discipline: ProgramDiscipline }) {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const language = i18n.language === 'it' ? 'it' : 'en';
  const [programs, setPrograms] = useState<UserProgram[] | null>(null);
  const [savedClusters, setSavedClusters] = useState<string[]>([]);
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [active, setActive] = useState<{ id: string; name: string } | null>(null);
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const [allPrograms, clusters, activeWorkout, names, hiddenIds] = await Promise.all([
        listUserPrograms(),
        listProgramClusters(),
        getActiveWorkout(),
        listRecentWorkoutNames(),
        discipline === 'strength' ? listHiddenTemplates() : Promise.resolve([] as string[]),
      ]);
      setLoadFailed(false);
      setPrograms(allPrograms.filter((program) => disciplineOf(program) === discipline));
      setSavedClusters(clusters);
      setActive(activeWorkout ? { id: activeWorkout.id, name: activeWorkout.name } : null);
      setRecentNames(names);
      setHidden(hiddenIds);
    } catch {
      setLoadFailed(true);
      setPrograms((current) => current ?? []);
    }
  }, [discipline]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const startHero = async (program: UserProgram, sessionId: string) => {
    if (starting) return;
    if (active) { setBlockedBy(active); return; }
    const session = program.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    setStarting(true);
    try {
      const workoutId = await startUserProgramSession(program, session);
      router.replace({ pathname: '/workout/[id]', params: { id: workoutId } });
    } catch {
      setNotice(t('programBuilder.startError'));
    } finally {
      setStarting(false);
    }
  };

  const updateHidden = (next: string[], message?: string) => {
    setHidden(next);
    void setHiddenTemplates(next);
    if (message) setNotice(message);
  };

  const isMobility = discipline === 'mobility';
  const templates = isMobility ? [] : programTemplates.filter((template) => !hidden.includes(template.id));
  const hiddenCount = isMobility ? 0 : programTemplates.length - templates.length;

  return (
    <Screen>
      {notice ? <Toast message={notice} onHide={() => setNotice(null)} /> : null}
      <PageHeading
        title={t(isMobility ? 'programDiscipline.mobilityPage' : 'programDiscipline.strengthPage')}
        action={(
          <IconButton
            icon="add"
            tone="accent"
            label={t('userProgram.create')}
            onPress={() => router.push({ pathname: '/program-builder', params: { discipline } })}
          />
        )}
      />

      <View style={styles.navRow}>
        <Chip
          icon={isMobility ? 'barbell-outline' : 'body-outline'}
          label={t(isMobility ? 'programDiscipline.switchToStrength' : 'programDiscipline.switchToMobility')}
          onPress={() => router.replace(isMobility ? '/programs/strength' : '/programs/mobility')}
        />
        {isMobility ? (
          <Chip
            icon="timer-outline"
            label={t('programDiscipline.mobilityHubLink')}
            onPress={() => router.push('/mobility')}
          />
        ) : null}
      </View>

      {loadFailed ? <LoadError onRetry={() => void load()} /> : null}
      {programs === null && !loadFailed ? <ActivityIndicator color={palette.accentStrong} /> : null}

      {programs && programs.length === 0 ? (
        <EmptyState
          icon={isMobility ? 'body-outline' : 'barbell-outline'}
          title={t(isMobility ? 'programDiscipline.emptyMobility' : 'programDiscipline.emptyStrength')}
          body={t('userProgram.myProgramsEmpty')}
          action={(
            <View style={styles.emptyAction}>
              <ActionButton
                icon="add"
                label={t('userProgram.create')}
                onPress={() => router.push({ pathname: '/program-builder', params: { discipline } })}
              />
            </View>
          )}
        />
      ) : null}

      {programs && programs.length > 0 ? (
        <ProgramsView
          programs={programs}
          savedClusters={savedClusters}
          recentNames={recentNames}
          starting={starting}
          onStartHero={(program, sessionId) => void startHero(program, sessionId)}
          onChanged={() => void load()}
          onNotice={setNotice}
        />
      ) : null}

      {isMobility ? (
        <ListRow
          icon="body-outline"
          title={t('programDiscipline.mobilityHubLink')}
          subtitle={t('programDiscipline.mobilityHubBody')}
          onPress={() => router.push('/mobility')}
        />
      ) : (
        <>
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
  navRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emptyAction: { alignSelf: 'stretch', marginTop: 6 },
  templatesLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  muted: { fontFamily: fonts.body, fontSize: 14 },
});
