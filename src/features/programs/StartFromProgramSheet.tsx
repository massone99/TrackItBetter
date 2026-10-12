import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { estimateSessionSeconds, sessionSetCount, type UserProgram, type UserProgramSession } from '../../domain/userProgram';
import { ActionButton, Body, ListGroup, ListRow, Sheet } from '../../shared/components/ui';
import { formatMinutes } from '../../shared/utils/format';
import { readDefaultRest } from '../session/restDefaults';
import { listExercises } from '../exercises/repository';
import { programTemplates } from './catalog';
import { startPrescribedWorkout, startUserProgramSession } from './startUserSession';
import { prescriptionsFromTemplate } from './templatePrescriptions';
import { listUserPrograms } from './userPrograms';

/** A program from the user's own or the built-in ones, with the days it can start. */
interface Choice {
  id: string;
  name: string;
  own: boolean;
  sessions: { id: string; name: string; exercises: UserProgramSession['exercises']; start: () => Promise<string> }[];
}

/**
 * Starts any workout of any program: pick a program (yours first, then the built-in ones), then one of
 * its workouts. A failure part-way leaves nothing behind (see `startPrescribedWorkout`).
 */
export function StartFromProgramSheet({ visible, onClose, onStarted, onError }: {
  visible: boolean;
  onClose: () => void;
  onStarted: (workoutId: string) => void;
  onError: (message: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.toLowerCase().startsWith('it') ? 'it' : 'en';
  const [own, setOwn] = useState<UserProgram[] | null>(null);
  const [metricById, setMetricById] = useState<Map<string, string>>(new Map());
  const [picked, setPicked] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    void Promise.all([listUserPrograms(), listExercises()]).then(([programs, exercises]) => {
      if (!mounted) return;
      setMetricById(new Map(exercises.map((exercise) => [exercise.id, exercise.metric])));
      setOwn(programs);
    }).catch(() => { if (mounted) setOwn([]); });
    return () => { mounted = false; };
  }, [visible]);

  const choices = useMemo<Choice[]>(() => [
    ...(own ?? []).map((program): Choice => ({
      id: program.id,
      name: program.name,
      own: true,
      sessions: program.sessions.map((session) => ({ id: session.id, name: session.name, exercises: session.exercises, start: () => startUserProgramSession(program, session) })),
    })),
    ...programTemplates.map((program): Choice => ({
      id: program.id,
      name: program.name[lang],
      own: false,
      sessions: program.sessions.map((session) => {
        const exercises = prescriptionsFromTemplate(session.id, session.exercises);
        return { id: session.id, name: session.name[lang], exercises, start: () => startPrescribedWorkout(session.name[lang], exercises) };
      }),
    })),
  ], [own, lang]);
  const program = choices.find((choice) => choice.id === picked);

  const start = async (session: Choice['sessions'][number]) => {
    if (starting) return;
    setStarting(session.id);
    try {
      const workoutId = await session.start();
      setPicked(null);
      onStarted(workoutId);
    } catch (reason) {
      setPicked(null);
      onError(`${t('startFrom.error')} (${reason instanceof Error ? reason.message : String(reason)})`);
    } finally {
      setStarting(null);
    }
  };

  const rest = readDefaultRest('working');
  return (
    <Sheet visible={visible} onClose={() => { setPicked(null); onClose(); }} title={program ? program.name : t('startFrom.title')}>
      {own === null ? <ActivityIndicator /> : program ? (
        <View style={styles.list}>
          {program.sessions.length === 0 ? <Body>{t('startFrom.noWorkouts')}</Body> : (
            <ListGroup>
              {program.sessions.map((session) => (
                <ListRow
                  key={session.id}
                  icon="play"
                  title={starting === session.id ? t('programBuilder.starting') : session.name}
                  subtitle={t('home.sessionMeta', { count: session.exercises.length, sets: sessionSetCount(session), minutes: formatMinutes(estimateSessionSeconds(session, metricById, rest)) })}
                  onPress={() => void start(session)}
                />
              ))}
            </ListGroup>
          )}
          <ActionButton icon="arrow-back" secondary label={t('startFrom.back')} onPress={() => setPicked(null)} />
        </View>
      ) : (
        <View style={styles.list}>
          {[true, false].map((isOwn) => {
            const group = choices.filter((choice) => choice.own === isOwn);
            if (group.length === 0) return null;
            return (
              <View key={String(isOwn)} style={styles.list}>
                <Body>{isOwn ? t('startFrom.yours') : t('startFrom.builtIn')}</Body>
                <ListGroup>
                  {group.map((choice) => (
                    <ListRow key={choice.id} icon="barbell-outline" title={choice.name} subtitle={t('startFrom.programMeta', { count: choice.sessions.length })} onPress={() => setPicked(choice.id)} />
                  ))}
                </ListGroup>
              </View>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
});
