import { groupSets } from '../../domain/setPairs';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { sessionSetCount, type UserProgram, type WorkoutExerciseLike } from '../../domain/userProgram';
import { ActionButton, Body, Icon, Sheet, Text, TextField, tapFeedback } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { saveWorkoutToProgram } from './saveWorkout';
import { listUserPrograms } from './userPrograms';

type Choice = 'new' | string;

/**
 * "Save as program workout": name the workout and choose where it goes, a new program or one of
 * yours. Works for a finished workout and for one still being built.
 */
export function SaveToProgramSheet({ visible, defaultName, exercises, onClose, onSaved }: {
  visible: boolean;
  defaultName: string;
  exercises: readonly WorkoutExerciseLike[];
  onClose: () => void;
  onSaved: (program: UserProgram) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [programs, setPrograms] = useState<UserProgram[]>([]);
  const [choice, setChoice] = useState<Choice>('new');
  const [workoutName, setWorkoutName] = useState(defaultName);
  const [programName, setProgramName] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    void listUserPrograms().then((found) => {
      if (!mounted) return;
      setQuery('');
      setPrograms(found);
      // The program edited last is the most likely destination.
      const latest = [...found].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      setChoice(latest ? latest.id : 'new');
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [visible]);

  const needle = query.trim().toLocaleLowerCase();
  // The chosen program stays visible while searching, so the selection never disappears.
  const shown = needle ? programs.filter((program) => program.id === choice || program.name.toLocaleLowerCase().includes(needle)) : programs;
  const empty = exercises.length === 0;
  const sets = exercises.reduce((sum, exercise) => sum + Math.max(1, groupSets(exercise.sets.filter((set) => set.kind !== 'warmup')).length || groupSets(exercise.sets).length), 0);
  const valid = !empty && workoutName.trim().length > 0 && (choice !== 'new' || programName.trim().length > 0);

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const program = await saveWorkoutToProgram({
        target: choice === 'new' ? { kind: 'new', programName } : { kind: 'existing', programId: choice },
        workoutName,
        exercises,
      });
      onSaved(program);
    } catch {
      setError(t('saveToProgram.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('saveToProgram.title')} body={empty ? t('saveToProgram.empty') : `${t('saveToProgram.exercisesCount', { count: exercises.length })} · ${t('log.setCount', { count: sets })}. ${t('saveToProgram.comesWith')}`}>
      <TextField label={t('saveToProgram.workoutName')} value={workoutName} onChangeText={setWorkoutName} maxLength={40} />
      <Text style={[styles.heading, { color: palette.textMuted }]}>{t('saveToProgram.where')}</Text>
      <Option icon="add-circle" title={t('saveToProgram.newProgram')} body={t('saveToProgram.newProgramBody')} selected={choice === 'new'} onPress={() => setChoice('new')} />
      {choice === 'new' ? (
        <TextField label={t('saveToProgram.programName')} value={programName} onChangeText={setProgramName} placeholder={t('programBuilder.namePlaceholder')} maxLength={60} />
      ) : null}
      {programs.length > 3 ? (
        <View style={[styles.searchBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Icon name="search" size={18} color={palette.textMuted} />
          <TextInput
            accessibilityLabel={t('saveToProgram.search')}
            placeholder={t('saveToProgram.search')}
            placeholderTextColor={palette.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.searchInput, { color: palette.text }]}
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.clear')} hitSlop={8} onPress={() => setQuery('')}>
              <Icon name="close-circle" size={18} color={palette.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {needle && !programs.some((program) => program.name.toLocaleLowerCase().includes(needle)) ? (
        <Text style={[styles.optionBody, { color: palette.textMuted }]}>{t('saveToProgram.noMatch', { query: query.trim() })}</Text>
      ) : null}
      {shown.map((program) => (
        <Option
          key={program.id}
          icon="albums-outline"
          title={program.name}
          body={program.sessions.length === 0 ? t('userProgram.noWorkoutsYet') : `${t('saveToProgram.workoutsCount', { count: program.sessions.length })} · ${t('log.setCount', { count: program.sessions.reduce((sum, session) => sum + sessionSetCount(session), 0) })}`}
          selected={choice === program.id}
          onPress={() => setChoice(program.id)}
        />
      ))}
      {error ? <Body accessibilityLiveRegion="polite" style={{ color: palette.warning }}>{error}</Body> : null}
      <ActionButton icon="bookmark" label={t('saveToProgram.save')} disabled={!valid || busy} onPress={() => void save()} />
      <ActionButton label={t('common.cancel')} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

/** A selectable destination: the selected one is outlined and filled with the accent. */
function Option({ icon, title, body, selected, onPress }: { icon: 'add-circle' | 'albums-outline'; title: string; body: string; selected: boolean; onPress: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${title}. ${body}`}
      accessibilityState={{ selected }}
      onPress={() => { tapFeedback(); onPress(); }}
      style={[styles.option, { backgroundColor: selected ? palette.accentSoft : palette.surface, borderColor: selected ? palette.accent : palette.border, borderWidth: selected ? 2 : 1 }]}
    >
      <View style={[styles.optionIcon, { backgroundColor: selected ? palette.accent : palette.surfaceMuted }]}>
        <Icon name={icon} size={20} color={selected ? palette.accentText : palette.accentStrong} />
      </View>
      <View style={styles.optionText}>
        <Text numberOfLines={1} style={[styles.optionTitle, { color: palette.text }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.optionBody, { color: palette.textMuted }]}>{body}</Text>
      </View>
      {selected ? <Icon name="checkmark-circle" size={22} color={palette.accentStrong} /> : null}
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, minHeight: 46 },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 16, paddingVertical: 10 },
  heading: { fontFamily: fonts.medium, fontSize: 13, marginTop: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, minHeight: 64 },
  optionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, gap: 1 },
  optionTitle: { fontFamily: fonts.display, fontSize: 18, lineHeight: 22 },
  optionBody: { fontFamily: fonts.body, fontSize: 13 },
});
