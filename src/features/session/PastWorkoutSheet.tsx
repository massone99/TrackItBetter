import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../shared/components/Text';
import { Label, ListRow, Sheet } from '../../shared/components/ui';
import { sessionSetCount, type UserProgram } from '../../domain/userProgram';
import { listUserPrograms } from '../programs/userPrograms';
import { logPastUserProgramSession } from '../programs/startUserSession';
import { defaultPastStart } from './pastStart';
import { createPastWorkout } from './repository';

/**
 * "Log a past workout": start from a workout of one of your programs (all its sets pre-filled and
 * done) or from an empty one. It opens on the details, where the day and time are set next.
 */
export function PastWorkoutSheet({ visible, dateKey, onClose }: { visible: boolean; dateKey: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [programs, setPrograms] = useState<UserProgram[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    void listUserPrograms().then(setPrograms).catch(() => setPrograms([]));
  }, [visible]);

  const close = () => { setError(null); onClose(); };
  const open = (workoutId: string) => {
    close();
    router.push({ pathname: '/workout/history/[id]', params: { id: workoutId, edit: '1' } });
  };
  const run = async (create: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { open(await create()); } catch { setError(t('log.pastError')); } finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} onClose={close} title={t('log.addPast')} body={t('log.pastBody')}>
      <ListRow icon="add-circle-outline" title={t('log.pastEmpty')} subtitle={t('log.pastEmptyBody')} onPress={() => void run(() => createPastWorkout({ name: t('log.pastName'), startedAt: defaultPastStart(dateKey), minutes: 60 }))} />
      {programs.filter((program) => program.sessions.some((session) => session.exercises.length > 0)).map((program) => (
        <View key={program.id} style={styles.group}>
          <Label>{program.name}</Label>
          {program.sessions.filter((session) => session.exercises.length > 0).map((session) => (
            <ListRow
              key={session.id}
              icon="list-outline"
              title={session.name}
              subtitle={t('log.pastSessionMeta', { exercises: session.exercises.length, sets: sessionSetCount(session) })}
              onPress={() => void run(() => logPastUserProgramSession(program, session, defaultPastStart(dateKey), 60))}
            />
          ))}
        </View>
      ))}
      {error ? <Text accessibilityLiveRegion="polite">{error}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: 2, marginTop: 6 },
});
