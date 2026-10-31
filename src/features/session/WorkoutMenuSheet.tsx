import { useTranslation } from 'react-i18next';
import { MenuList, MenuRow, Sheet } from '../../shared/components/ui';

/** What the workout screen used to scatter around its top and bottom: settings, bulk actions and the destructive ones. */
export function WorkoutMenuSheet({ visible, onClose, focusMode, telemetryOn, voiceCues, canFold, allCollapsed, canNarrate, canClear, onCheckIn, onFocus, onTelemetry, onVoice, onNarrate, onFoldAll, onSave, onClear, onDiscard }: {
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
  onSave: () => void;
  onClear: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const state = (on: boolean) => t(on ? 'workout.menuOn' : 'workout.menuOff');
  // Each row closes the menu first, so the sheet it opens is not stacked on this one.
  const row = (action: () => void) => () => { onClose(); action(); };
  return (
    <Sheet visible={visible} onClose={onClose} title={t('workout.menu')}>
      <MenuList>
        <MenuRow icon="pulse-outline" label={t('workout.readinessTitle')} onPress={row(onCheckIn)} />
        <MenuRow icon="scan-outline" label={`${t('logger.focusChip')} · ${state(focusMode)}`} onPress={row(onFocus)} />
        <MenuRow icon="speedometer-outline" label={`${t('telemetry.title')} · ${state(telemetryOn)}`} onPress={row(onTelemetry)} />
        <MenuRow icon={voiceCues ? 'volume-high' : 'volume-mute-outline'} label={`${t('logger.voiceChip')} · ${state(voiceCues)}`} onPress={row(onVoice)} />
        {canNarrate ? <MenuRow icon="mic-outline" label={t('narration.start')} onPress={row(onNarrate)} /> : null}
        {canFold ? <MenuRow icon={allCollapsed ? 'chevron-down' : 'chevron-up'} label={t(allCollapsed ? 'common.expandAll' : 'common.collapseAll')} onPress={row(onFoldAll)} /> : null}
        <MenuRow icon="bookmark-outline" label={t('saveToProgram.action')} onPress={row(onSave)} />
        {canClear ? <MenuRow icon="remove-circle-outline" label={t('logger.clearAllSets')} tone="danger" onPress={row(onClear)} /> : null}
        <MenuRow icon="close-circle-outline" label={t('workout.discard')} tone="danger" onPress={row(onDiscard)} />
      </MenuList>
    </Sheet>
  );
}
