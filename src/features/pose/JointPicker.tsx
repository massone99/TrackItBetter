import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { selectedJoints, type JointAngleId, type PositionDefinition } from '../../domain/pose';
import { Icon, Label, tapFeedback, Text } from '../../shared/components/ui';
import { readPreference, writePreference } from '../../shared/settings/preferences';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { JOINT_COLORS } from './overlay/model';

const key = (positionId: string) => `pose.joints.${positionId}`;

function readSaved(positionId: string): string[] | null {
  const raw = readPreference(key(positionId));
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : null;
  } catch {
    return null;
  }
}

/** The joint angles chosen for a position, remembered per position on this device. */
export function useJointSelection(position: PositionDefinition): [JointAngleId[], (ids: JointAngleId[]) => void] {
  const [saved, setSaved] = useState(() => readSaved(position.id));
  const [savedFor, setSavedFor] = useState(position.id);
  // Switching position loads that position's own choice.
  if (savedFor !== position.id) {
    setSavedFor(position.id);
    setSaved(readSaved(position.id));
  }
  const update = (ids: JointAngleId[]) => {
    setSaved(ids);
    writePreference(key(position.id), JSON.stringify(ids));
  };
  return [selectedJoints(position, saved), update];
}

/**
 * Chips for the joint angles drawn on the photo and listed with the result. Plain toggles by
 * default. Given `values` (the live angles), each chosen joint shows its colour and degrees, and
 * with `onFocus` a tap works in three steps: add (and show it on the photo), show, remove.
 */
export function JointPicker({ position, selected, onChange, values, focused = null, onFocus, title }: {
  position: PositionDefinition;
  selected: JointAngleId[];
  onChange: (ids: JointAngleId[]) => void;
  values?: Partial<Record<JointAngleId, string>>;
  focused?: JointAngleId | null;
  onFocus?: (id: JointAngleId | null) => void;
  title?: string;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  if (position.joints.length === 0) return null;
  const toggle = (id: JointAngleId) => {
    // Keep the position's own order whatever order the chips were tapped in.
    const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
    onChange(position.joints.filter((item) => next.includes(item)));
  };
  const press = (id: JointAngleId) => {
    tapFeedback();
    if (!onFocus) { toggle(id); return; }
    if (!selected.includes(id)) { toggle(id); onFocus(id); return; }
    if (focused !== id) { onFocus(id); return; }
    toggle(id);
    onFocus(null);
  };
  return (
    <View style={styles.root}>
      <Label>{title ?? t('pose.chooseJoints')}</Label>
      <View style={styles.chips}>
        {position.joints.map((id) => {
          const on = selected.includes(id);
          const shown = on && focused === id;
          const color = JOINT_COLORS[id];
          const name = t(`pose.jointsShort.${id}`);
          const value = values?.[id];
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={value && on ? `${name} ${value}` : name}
              hitSlop={4}
              onPress={() => press(id)}
              style={({ pressed }) => [styles.chip, {
                borderColor: on ? color : palette.border,
                borderWidth: on ? 2 : 1,
                backgroundColor: shown ? color : on ? palette.accentSoft : palette.surface,
                opacity: pressed ? 0.8 : 1,
              }]}
            >
              {on ? <View style={[styles.dot, { backgroundColor: shown ? '#FFFFFF' : color }]} /> : <Icon name="add" size={16} color={palette.textMuted} />}
              <Text style={[styles.name, { color: shown ? '#FFFFFF' : on ? palette.text : palette.textMuted }]}>{name}</Text>
              {on && value ? <Text style={[styles.value, { color: shown ? '#FFFFFF' : palette.text }]}>{value}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {onFocus ? <Text style={[styles.hint, { color: palette.textMuted }]}>{t('pose.anglesHint')}</Text> : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  root: { gap: 8 },
  // Chips wrap so every joint is visible without scrolling sideways.
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { fontFamily: fonts.medium, fontSize: 15 },
  value: { fontFamily: fonts.display, fontSize: 18 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
});
