import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { parseQuickAdd } from '../../../domain/programStructure';
import { isTimedMetric, type UserProgramExercise } from '../../../domain/userProgram';
import { IconButton, TextField } from '../../../shared/components/ui';
import { fonts } from '../../../shared/theme/typography';
import { quickAddPrescription, resolveExerciseQuery, type BuilderExercise } from './helpers';

/**
 * One line to add a movement: "curl 3x10 @7 r90 +5kg". Resolves the name against the library;
 * with no match, `onNoMatch` opens the normal picker. `s` after the number is only valid for timed movements.
 */
export function QuickAddLine({ exercises, newId, onAdd, onNoMatch }: {
  exercises: ReadonlyMap<string, BuilderExercise>;
  newId: () => string;
  onAdd: (prescription: UserProgramExercise) => void;
  onNoMatch: (query: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const quick = parseQuickAdd(text);
    if (!quick) { setError(t('builderPlus.quickFormat')); return; }
    const match = resolveExerciseQuery(quick.query, exercises.values());
    if (!match) { onNoMatch(quick.query); return; }
    const prescription = quickAddPrescription(quick, match, newId);
    if (!prescription) { setError(t(isTimedMetric(match.metric) ? 'builderPlus.quickNeedsSeconds' : 'builderPlus.quickSecondsOnly', { name: match.name })); return; }
    onAdd(prescription);
    setText('');
    setError(null);
  };

  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <TextField
          label={t('builderPlus.quickLabel')}
          value={text}
          onChangeText={(value) => { setText(value); if (error) setError(null); }}
          placeholder={t('builderPlus.quickPlaceholder')}
          hint={t('builderPlus.quickHint')}
          error={error}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={submit}
          style={styles.mono}
        />
      </View>
      <IconButton icon="add" label={t('builderPlus.quickAdd')} size={48} onPress={submit} disabled={text.trim().length === 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  field: { flex: 1, minWidth: 160 },
  mono: { fontFamily: fonts.mono },
});
