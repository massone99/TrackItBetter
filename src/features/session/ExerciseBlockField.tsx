import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BLOCKS, type Block } from '../../domain/blocks';
import { Label, SegmentedControl } from '../../shared/components/ui';
import { setEntryBlock } from './repository';

/** Which part of the workout an exercise belongs to; the workout keeps them grouped in that order. */
export function ExerciseBlockField({ entryId, value, onChanged }: { entryId: string; value: Block; onChanged: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.field}>
      <Label>{t('workout.blocks.title')}</Label>
      <SegmentedControl<Block>
        value={value}
        onChange={(block) => { if (value !== block) void setEntryBlock(entryId, block).then(onChanged); }}
        options={BLOCKS.map((block) => ({ value: block, label: t(`workout.blocks.${block}`) }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
});
