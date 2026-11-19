import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAutosavedText } from '../../shared/forms/useAutosavedText';
import { Icon, Text, TextField } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, radii, spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

/**
 * The note of an exercise within a workout, on its card: always visible when there is one, one tap
 * to edit in place (it saves by itself), and an "Add note" row when there is none. Folded cards
 * keep a one-line preview. Without `onSave` it only shows the note.
 */
export function ExerciseNoteBlock({ note, collapsed, onSave }: { note: string | null; collapsed: boolean; onSave?: (note: string) => void }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [editing, setEditing] = useState(false);

  if (!onSave) {
    return note ? <Text numberOfLines={collapsed ? 1 : 3} style={[styles.text, styles.readOnly, { color: palette.textMuted }]}>{note}</Text> : null;
  }
  // The mode is part of the key, so the block remounts cleanly when it swaps between showing and editing.
  if (editing) return <NoteEditor key="edit" initial={note ?? ''} onSave={onSave} onDone={() => setEditing(false)} />;
  if (!note) {
    if (collapsed) return null;
    return (
      <Pressable
        key="add"
        accessibilityRole="button"
        accessibilityLabel={t('logger.addExerciseNote')}
        onPress={() => setEditing(true)}
        style={({ pressed }) => [styles.row, styles.addRow, pressed && { opacity: 0.6 }]}
      >
        <Icon name="create-outline" size={16} color={palette.accentStrong} />
        <Text style={[styles.text, { color: palette.accentStrong }]}>{t('logger.addExerciseNote')}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      key="view"
      accessibilityRole="button"
      accessibilityLabel={`${t('logger.exerciseNoteLabel')}: ${note}`}
      accessibilityHint={t('logger.editExerciseNote')}
      onPress={() => setEditing(true)}
      style={({ pressed }) => [styles.row, styles.noteRow, { backgroundColor: palette.surfaceMuted }, pressed && { opacity: 0.7 }]}
    >
      <Icon name="chatbubble-ellipses-outline" size={16} color={palette.textMuted} />
      <Text numberOfLines={collapsed ? 1 : 3} style={[styles.text, styles.grow, { color: palette.text }]}>{note}</Text>
    </Pressable>
  );
}

function NoteEditor({ initial, onSave, onDone }: { initial: string; onSave: (note: string) => void; onDone: () => void }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { value, change, flush } = useAutosavedText(initial, onSave);
  return (
    <View style={styles.editor}>
      <TextField
        label={t('logger.exerciseNoteLabel')}
        value={value}
        onChangeText={change}
        onBlur={() => { flush(); onDone(); }}
        placeholder={t('logger.exerciseNotePlaceholder')}
        multiline
        autoFocus
        maxLength={1000}
      />
    </View>
  );
}

const baseStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, borderRadius: radii.control },
  addRow: { alignSelf: 'flex-start', paddingHorizontal: spacing.xs },
  noteRow: { alignItems: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  grow: { flex: 1 },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  readOnly: { marginTop: spacing.xs },
  editor: { marginTop: spacing.xs },
});
