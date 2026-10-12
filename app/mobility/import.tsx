import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { stepsFromWorkout, summarizeImport, type ImportCompatibility, type ImportExercise, type ImportExerciseInfo } from '../../src/domain/mobilityImport';
import { isMobilityExercise } from '../../src/features/exercises/categories';
import { listExercises } from '../../src/features/exercises/repository';
import { saveMobilityRoutine } from '../../src/features/mobility/routines';
import { readNarrationPrepSec } from '../../src/features/narration/settings';
import { programTemplates } from '../../src/features/programs/catalog';
import { listUserPrograms } from '../../src/features/programs/userPrograms';
import { Body, Card, Chip, EmptyState, FooterAction, PageHeading, Screen, SectionTitle, SegmentedControl, Text } from '../../src/shared/components/ui';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';

type Mode = 'workout' | 'program';
interface Source { id: string; name: string; sessions: { id: string; name: string; exercises: ImportExercise[] }[] }

const MAX_NAME = 60;

export default function MobilityImportScreen() {
  const styles = useScaledStyles(baseStyles);
  const params = useLocalSearchParams<{ mode?: string }>();
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const lang = i18n.language.toLowerCase().startsWith('it') ? 'it' : 'en';
  const [mode, setMode] = useState<Mode>(params.mode === 'program' ? 'program' : 'workout');
  const [own, setOwn] = useState<Source[] | null>(null);
  const [info, setInfo] = useState<Map<string, ImportExerciseInfo> | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [programs, exercises] = await Promise.all([listUserPrograms(), listExercises()]);
      if (!mounted) return;
      setOwn(programs.map((program) => ({
        id: program.id,
        name: program.name,
        sessions: program.sessions.map((session) => ({
          id: session.id,
          name: session.name,
          exercises: session.exercises.map((exercise) => ({ exerciseId: exercise.exerciseId, sets: exercise.sets, target: exercise.target, restSeconds: exercise.restSeconds ?? null })),
        })),
      })));
      setInfo(new Map(exercises.map((exercise) => [exercise.id, { mobility: isMobilityExercise(exercise), metric: exercise.metric, unilateral: exercise.unilateral }])));
      setNames(new Map(exercises.map((exercise) => [exercise.id, exercise.name])));
    })();
    return () => { mounted = false; };
  }, []);

  const templates = useMemo<Source[]>(() => programTemplates.map((program) => ({
    id: program.id,
    name: program.name[lang],
    sessions: program.sessions.map((session) => ({
      id: session.id,
      name: session.name[lang],
      exercises: session.exercises.map((exercise) => ({ exerciseId: exercise.exerciseId, sets: exercise.sets, target: exercise.target.seconds ?? exercise.target.reps ?? null, restSeconds: exercise.restSeconds })),
    })),
  })), [lang]);
  const sources = useMemo(() => [...(own ?? []), ...templates], [own, templates]);
  const source = sources.find((item) => item.id === sourceId) ?? sources[0];
  const loading = own === null || info === null;

  const rows = useMemo(() => (source && info ? source.sessions.map((session) => ({ session, summary: summarizeImport(session.exercises, info) })) : []), [source, info]);
  const compatible = rows.filter((row) => row.summary.mobility > 0);
  const selected = mode === 'workout' ? rows.find((row) => row.session.id === sessionId && row.summary.mobility > 0) : undefined;

  const create = async () => {
    if (!info || !source || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const prepSec = readNarrationPrepSec();
      const make = (session: Source['sessions'][number]) => saveMobilityRoutine({
        name: session.name.slice(0, MAX_NAME),
        programId: source.id,
        programName: source.name.slice(0, 80),
        transitionSec: 10,
        prepSec,
        steps: stepsFromWorkout(session.exercises, info, () => Crypto.randomUUID()).slice(0, 40),
      });
      if (mode === 'workout' && selected) {
        const routine = await make(selected.session);
        router.replace({ pathname: '/mobility/routine/[id]', params: { id: routine.id } });
      } else if (mode === 'program') {
        for (const row of compatible) await make(row.session);
        router.replace('/mobility');
      }
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  const footer = mode === 'workout'
    ? (selected ? <FooterAction icon="checkmark" label={t('mobilityHub.importCreate', { name: selected.session.name })} onPress={() => void create()} disabled={busy} /> : undefined)
    : (compatible.length > 0 ? <FooterAction icon="checkmark" label={t('mobilityHub.importCreateAll', { count: compatible.length })} onPress={() => void create()} disabled={busy} /> : undefined);

  return (
    <Screen footer={footer}>
      <PageHeading title={t('mobilityHub.importTitle')} />
      <SegmentedControl<Mode> value={mode} onChange={setMode} options={[{ value: 'workout', label: t('mobilityHub.importModeWorkout') }, { value: 'program', label: t('mobilityHub.importModeProgram') }]} />

      {!loading && sources.length === 0 ? <EmptyState icon="barbell-outline" title={t('mobilityHub.importNoPrograms')} body="" /> : null}
      {!loading && source ? (
        <>
          <SectionTitle title={t('mobilityHub.importProgram')} />
          <View style={styles.chips}>
            {sources.map((item) => <Chip key={item.id} label={item.name} selected={item.id === source.id} onPress={() => { setSourceId(item.id); setSessionId(null); }} />)}
          </View>

          {mode === 'program' && compatible.length === 0 ? <Body>{t('mobilityHub.importNothing')}</Body> : null}
          {mode === 'program' && compatible.length > 0 ? <Body>{t('mobilityHub.importAllHint')}</Body> : null}
          {rows.map(({ session, summary }) => {
            const picked = mode === 'workout' && session.id === selected?.session.id;
            const enabled = summary.compatibility !== 'none';
            return (
              <Pressable
                key={session.id}
                accessibilityRole={mode === 'workout' ? 'button' : undefined}
                accessibilityState={{ selected: picked, disabled: mode === 'workout' && !enabled }}
                disabled={mode !== 'workout' || !enabled}
                onPress={() => setSessionId(session.id)}
                style={[styles.row, { backgroundColor: palette.surface, borderColor: picked ? palette.accentStrong : palette.border, borderWidth: picked ? 2 : 1, opacity: enabled ? 1 : 0.6 }]}
              >
                <View style={styles.rowHead}>
                  <Text style={styles.rowName}>{session.name}</Text>
                  <Badge compatibility={summary.compatibility} />
                </View>
                <Text style={[styles.rowMeta, { color: palette.textMuted }]}>
                  {summary.mobility === 0 ? t('mobilityHub.importNoMobility') : t('mobilityHub.importCoverage', { mobility: summary.mobility, total: summary.total })}
                  {summary.compatibility === 'partial' ? ` · ${t('mobilityHub.importSkipped', { count: summary.total - summary.mobility })}` : ''}
                </Text>
              </Pressable>
            );
          })}

          {mode === 'workout' && !selected ? <Body>{t('mobilityHub.importPickWorkout')}</Body> : null}
          {selected && info ? (
            <>
              <SectionTitle title={t('mobilityHub.importPreview')} />
              <Card>
                {selected.session.exercises.filter((exercise) => info.get(exercise.exerciseId)?.mobility).map((exercise) => (
                  <View key={exercise.exerciseId + exercise.sets} style={styles.previewRow}>
                    <Text style={styles.previewName}>{names.get(exercise.exerciseId) ?? '…'}</Text>
                    <Text style={[styles.rowMeta, { color: palette.textMuted }]}>{exercise.sets} × {exercise.target ?? '–'}</Text>
                  </View>
                ))}
              </Card>
              <Body>{t('mobilityHub.importPreviewHint')}</Body>
            </>
          ) : null}
        </>
      ) : null}
      {failed ? <Text style={[styles.rowMeta, { color: palette.warning }]}>{t('mobilityHub.importError')}</Text> : null}
    </Screen>
  );
}

function Badge({ compatibility }: { compatibility: ImportCompatibility }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const tone = compatibility === 'full' ? { bg: palette.successSoft, fg: palette.success } : compatibility === 'partial' ? { bg: palette.recordSoft, fg: palette.record } : { bg: palette.surfaceMuted, fg: palette.textMuted };
  const { t } = useTranslation();
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.badgeText, { color: tone.fg }]}>{compatibility === 'full' ? t('mobilityHub.importCompatible') : compatibility === 'partial' ? t('mobilityHub.importPartial') : t('mobilityHub.importNone')}</Text>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { borderRadius: 16, padding: 16, gap: 6, minHeight: 48 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowName: { flex: 1, fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22 },
  rowMeta: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  badge: { paddingHorizontal: 10, minHeight: 26, borderRadius: 999, justifyContent: 'center' },
  badgeText: { fontFamily: fonts.semibold, fontSize: 13 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  previewName: { flex: 1, fontFamily: fonts.medium, fontSize: 16, lineHeight: 22 },
});
