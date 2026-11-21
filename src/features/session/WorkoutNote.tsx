import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActionButton, Icon, Sheet, tapFeedback, Text, TextField } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

export type WorkoutNoteKind = 'workoutNote' | 'exerciseNote' | 'setNote';

export function WorkoutNote({ kind, value, onPress, inset = false }: {
  kind: WorkoutNoteKind; value: string | null; onPress: () => void; inset?: boolean;
}) {
  const { t } = useTranslation();
  const { palette, mode } = useTheme();
  const styles = useScaledStyles(baseStyles);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t(`liveWorkout.${kind}`)}
      accessibilityHint={value ?? t('liveWorkout.addNote')} onPress={() => { tapFeedback(); onPress(); }}
      style={({ pressed }) => [styles.note, inset ? styles.inset : styles.outlined,
        { borderColor: palette.border, backgroundColor: kind === 'exerciseNote' ? palette.surface : mode === 'light' ? '#f5f7f9' : palette.surfaceMuted },
        pressed && { opacity: 0.75 }]}>
      <Icon name="document-text-outline" size={16} color={palette.accentStrong} />
      <View style={styles.text}>
        <Text style={styles.label}>{t(`liveWorkout.${kind}`)}</Text>
        <Text numberOfLines={1} style={[styles.preview, { color: palette.textMuted }]}>{value || t('liveWorkout.addNote')}</Text>
      </View>
    </Pressable>
  );
}

export function WorkoutNoteSheet({ kind, context, initial, onClose, onSave }: {
  kind: WorkoutNoteKind; context: string; initial: string | null; onClose: () => void; onSave: (note: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const [value, setValue] = useState(initial ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(false);
    try { await onSave(value); onClose(); }
    catch { setError(true); setSaving(false); }
  };
  return (
    <Sheet visible onClose={() => { if (!saving) onClose(); }} title={t(`liveWorkout.${kind}`)} subtitle={context} compact>
      <TextField accessibilityLabel={t(`liveWorkout.${kind}`)} placeholder={t('liveWorkout.notePlaceholder')}
        multiline maxLength={kind === 'setNote' ? 500 : 1000} value={value} onChangeText={setValue} editable={!saving}
        style={[styles.input, { backgroundColor: palette.background }]} error={error ? t('liveWorkout.saveFailed') : null} />
      <View style={styles.actions}>
        <ActionButton compact secondary label={t('common.cancel')} onPress={onClose} disabled={saving} />
        <ActionButton compact label={t('liveWorkout.saveNote')} onPress={() => void save()} disabled={saving} />
      </View>
    </Sheet>
  );
}

const baseStyles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 48, paddingHorizontal: 11, paddingVertical: 7 },
  outlined: { borderWidth: 1, borderRadius: 4 },
  inset: { paddingHorizontal: 14 },
  text: { flex: 1, minWidth: 0 },
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
  preview: { fontSize: 12, lineHeight: 16 },
  input: { minHeight: 110, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
});
