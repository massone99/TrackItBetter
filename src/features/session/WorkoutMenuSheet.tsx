import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ActionButton, Label, MenuList, MenuRow, MenuSwitchRow, Sheet } from '../../shared/components/ui';
import { spacing } from '../../shared/theme/tokens';

/**
 * The workout's one menu: Finish first, then actions on this workout, then display and sound switches with their
 * state, and the destructive actions apart at the end.
 */
export function WorkoutMenuSheet({ visible, onClose, subtitle, position, hasNote, rated, focusMode, telemetryOn, voiceCues, canNarrate, canClear, canFinish, onFinish, onCheckIn, onFocus, onTelemetry, onVoice, onNarrate, onDetails, onSave, onClear, onOverview, onDiscard }: {
  visible: boolean;
  onClose: () => void;
  /** Program, elapsed time and sets, under the title. */
  subtitle?: string;
  /** "1 of 7", shown on the All exercises row. */
  position?: string;
  hasNote: boolean;
  rated: boolean;
  focusMode: boolean;
  telemetryOn: boolean;
  voiceCues: boolean;
  canNarrate: boolean;
  canClear: boolean;
  canFinish: boolean;
  onFinish: () => void;
  onCheckIn: () => void;
  onFocus: () => void;
  onTelemetry: () => void;
  onVoice: () => void;
  onNarrate: () => void;
  onDetails: () => void;
  onSave: () => void;
  onClear: () => void;
  onOverview?: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  // Each row closes the menu first, so the sheet it opens is not stacked on this one.
  const row = (action: () => void) => () => { onClose(); action(); };
  return (
    <Sheet visible={visible} onClose={onClose} title={t('simple.workoutMenuTitle')} subtitle={subtitle}>
      {canFinish ? <ActionButton icon="flag" label={t('workout.finish')} onPress={row(onFinish)} /> : null}
      <View style={styles.group}>
        <Label>{t('simple.thisWorkout')}</Label>
        <MenuList>
          {onOverview ? <MenuRow label={t('simple.allExercises')} value={position} chevron onPress={row(onOverview)} /> : null}
          <MenuRow label={t('workoutDetails.editAction')} value={hasNote ? undefined : t('simple.noNote')} chevron onPress={row(onDetails)} />
          <MenuRow label={t('workout.readinessTitle')} value={rated ? undefined : t('simple.notRated')} chevron onPress={row(onCheckIn)} />
          {canNarrate ? <MenuRow label={t('narration.start')} chevron onPress={row(onNarrate)} /> : null}
          <MenuRow label={t('saveToProgram.action')} chevron onPress={row(onSave)} />
        </MenuList>
      </View>
      <View style={styles.group}>
        <Label>{t('simple.displaySound')}</Label>
        <MenuList>
          <MenuSwitchRow label={t('simple.oneAtATime')} value={focusMode} onChange={onFocus} />
          <MenuSwitchRow label={t('telemetry.title')} value={telemetryOn} onChange={onTelemetry} />
          <MenuSwitchRow label={t('logger.voiceChip')} value={voiceCues} onChange={onVoice} />
        </MenuList>
      </View>
      <MenuList>
        <MenuRow icon="close-circle-outline" label={t('workout.discard')} tone="danger" onPress={row(onDiscard)} />
        {canClear ? <MenuRow icon="remove-circle-outline" label={t('logger.clearAllSets')} tone="danger" onPress={row(onClear)} /> : null}
      </MenuList>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
});
