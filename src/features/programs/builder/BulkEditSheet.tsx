import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { DurationField } from '../../../shared/components/DateTimePickers';
import { ActionButton, Chip, MenuGroup, Sheet, Stepper } from '../../../shared/components/ui';
import { RpePicker } from '../../session/RpePicker';
import { readDefaultRest } from '../../session/restDefaults';
import type { BulkChange } from './helpers';

const REST_PRESETS = [30, 60, 90, 120, 180];

/** Rest, target RPE and sets for several exercises at once; only the parts switched on are applied. */
export function BulkEditSheet({ visible, count, onClose, onApply }: { visible: boolean; count: number; onClose: () => void; onApply: (change: BulkChange) => void }) {
  const { t } = useTranslation();
  const [sets, setSets] = useState<number | null>(null);
  const [rest, setRest] = useState<number | null>(null);
  const [rpe, setRpe] = useState<{ value: number | null } | null>(null);
  const defaultRest = readDefaultRest('working');
  const presets = [...new Set([...REST_PRESETS, defaultRest])].sort((a, b) => a - b);
  const reset = () => { setSets(null); setRest(null); setRpe(null); };
  const nothing = sets === null && rest === null && rpe === null;

  return (
    <Sheet visible={visible} onClose={() => { reset(); onClose(); }} title={t('builderPlus.bulkTitle')} body={t('builderPlus.bulkBody', { count })}>
      <MenuGroup title={t('programBuilder.sets')}>
        <View style={styles.toggle}><Chip label={t(sets === null ? 'builderPlus.keep' : 'builderPlus.change')} selected={sets !== null} onPress={() => setSets(sets === null ? 3 : null)} /></View>
        {sets !== null ? <Stepper layout="row" label={t('programBuilder.sets')} value={sets} min={1} max={20} editable onChange={(value) => setSets(Math.max(1, Math.round(value)))} /> : null}
      </MenuGroup>
      <MenuGroup title={t('userProgram.rest')}>
        <View style={styles.toggle}><Chip label={t(rest === null ? 'builderPlus.keep' : 'builderPlus.change')} selected={rest !== null} onPress={() => setRest(rest === null ? defaultRest : null)} /></View>
        {rest !== null ? (
          <DurationField label={t('userProgram.rest')} value={rest} max={600} step={5} presets={presets} format={(seconds) => t('userProgram.secondsValue', { value: seconds })} onChange={setRest} />
        ) : null}
      </MenuGroup>
      <MenuGroup title={t('programBuilder.rpeTarget')}>
        <View style={styles.toggle}><Chip label={t(rpe === null ? 'builderPlus.keep' : 'builderPlus.change')} selected={rpe !== null} onPress={() => setRpe(rpe === null ? { value: null } : null)} /></View>
        {rpe !== null ? <RpePicker compact grid value={rpe.value} onChange={(value) => setRpe({ value })} /> : null}
      </MenuGroup>
      <ActionButton
        icon="checkmark"
        label={t('builderPlus.apply', { count })}
        disabled={nothing}
        onPress={() => {
          onApply({ ...(sets !== null ? { sets } : {}), ...(rest !== null ? { restSeconds: rest } : {}), ...(rpe !== null ? { rpe: rpe.value } : {}) });
          reset();
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({ toggle: { flexDirection: 'row' } });
