import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { selectedJoints, type JointAngleId, type PositionDefinition } from '../../domain/pose';
import { Chip, Label } from '../../shared/components/ui';
import { readPreference, writePreference } from '../../shared/settings/preferences';

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

/** Toggle chips for the joint angles drawn on the photo and listed with the result. */
export function JointPicker({ position, selected, onChange }: { position: PositionDefinition; selected: JointAngleId[]; onChange: (ids: JointAngleId[]) => void }) {
  const { t } = useTranslation();
  if (position.joints.length === 0) return null;
  const toggle = (id: JointAngleId) => {
    // Keep the position's own order whatever order the chips were tapped in.
    const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
    onChange(position.joints.filter((item) => next.includes(item)));
  };
  return (
    <View style={styles.root}>
      <Label>{t('pose.chooseJoints')}</Label>
      <View style={styles.chips}>
        {position.joints.map((id) => (
          <Chip
            key={id}
            icon={selected.includes(id) ? 'checkmark' : 'add'}
            label={t(`pose.jointsShort.${id}`)}
            selected={selected.includes(id)}
            onPress={() => toggle(id)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  // Chips wrap so every joint is visible without scrolling sideways.
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
