import { useTranslation } from 'react-i18next';
import { MenuList, MenuRow, Sheet } from '../../shared/components/ui';

/** What the workout screen used to scatter around its top and bottom: settings, bulk actions and the destructive ones. */
export function WorkoutMenuSheet({ visible, onClose, focusMode, telemetryOn, voiceCues, canFold, allCollapsed, canNarrate, canClear, onCheckIn, onFocus, onTelemetry, onVoice, onNarrate, onFoldAll, onDetails, onSave, onClear, onOverview, onShowTelemetry, onDiscard }: {
  visible: boolean;
  onClose: () => void;
  focusMode: boolean;
  telemetryOn: boolean;
  voiceCues: boolean;
  canFold: boolean;
  allCollapsed: boolean;
  canNarrate: boolean;
  canClear: boolean;
  onCheckIn: () => void;
  onFocus: () => void;
  onTelemetry: () => void;
  onVoice: () => void;
  onNarrate: () => void;
  onFoldAll: () => void;
  onDetails: () => void;
  onSave: () => void;
  onClear: () => void;
  onOverview?: () => void;
  onShowTelemetry?: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const state = (on: boolean) => t(on ? 'workout.menuOn' : 'workout.menuOff');
  // Each row closes the menu first, so the sheet it opens is not stacked on this one.
  const row = (action: () => void) => () => { onClose(); action(); };
  return (
    <Sheet visible={visible} onClose={onClose} title={t('workout.menu')}>
      <MenuList>
        {onOverview ? <MenuRow icon="list-outline" label={t('liveWorkout.overview')} onPress={row(onOverview)} /> : null}
        {onShowTelemetry ? <MenuRow icon="speedometer-outline" label={t('telemetry.title')} onPress={row(onShowTelemetry)} /> : null}
        <MenuRow icon="pulse-outline" label={t('workout.readinessTitle')} onPress={row(onCheckIn)} />
        <MenuRow icon="scan-outline" label={t(focusMode ? 'liveWorkout.inlineEditor' : 'liveWorkout.focusEditor')} onPress={row(onFocus)} />
        <MenuRow icon="speedometer-outline" label={`${t('telemetry.title')} · ${state(telemetryOn)}`} onPress={row(onTelemetry)} />
        <MenuRow icon={voiceCues ? 'volume-high' : 'volume-mute-outline'} label={`${t('logger.voiceChip')} · ${state(voiceCues)}`} onPress={row(onVoice)} />
        {canNarrate ? <MenuRow icon="mic-outline" label={t('narration.start')} onPress={row(onNarrate)} /> : null}
        {canFold ? <MenuRow icon={allCollapsed ? 'chevron-down' : 'chevron-up'} label={t(allCollapsed ? 'common.expandAll' : 'common.collapseAll')} onPress={row(onFoldAll)} /> : null}
        <MenuRow icon="document-text-outline" label={t('workoutDetails.editAction')} onPress={row(onDetails)} />
        <MenuRow icon="bookmark-outline" label={t('saveToProgram.action')} onPress={row(onSave)} />
        <MenuRow icon="close-circle-outline" label={t('workout.discard')} tone="danger" onPress={row(onDiscard)} />
        {canClear ? <MenuRow icon="remove-circle-outline" label={t('logger.clearAllSets')} tone="danger" onPress={row(onClear)} /> : null}
      </MenuList>
    </Sheet>
  );
}
