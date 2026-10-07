import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { setAssistKg, type SetBand, type Tension } from '../../domain/equipment';
import { ActionButton, Body, Chip, IconButton, Label, MenuGroup, SegmentedControl, tapFeedback, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatNumber } from '../../shared/utils/format';
import { setSetBands, type SessionExercise, type SessionSet } from '../session/repository';
import { bandRange, bandsById, useEquipment } from './useEquipment';

const TENSIONS: Tension[] = [1, 2, 3];

/**
 * Resistance bands that help one set: any number of bands from the user's band sets, each with how
 * far it is stretched (1–3). The assistance in kg is worked out and saved with the set.
 */
export function SetBandsField({ exercise, set, onChanged }: { exercise: SessionExercise; set: SessionSet; onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const { catalog } = useEquipment();
  const [bands, setBands] = useState<SetBand[]>(set.bands);
  const [picking, setPicking] = useState(false);
  const [bandSetId, setBandSetId] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  if (!catalog) return null;
  const byId = bandsById(catalog);
  const sets = catalog.bandSets.filter((item) => !item.archived && item.bands.length > 0);
  const chosenSet = sets.find((item) => item.id === bandSetId) ?? sets[0] ?? null;
  const assist = setAssistKg(bands, byId);

  const save = (next: SetBand[]) => {
    setBands(next);
    setApplied(false);
    void setSetBands(set.id, next, byId).then(onChanged);
  };
  const applyToRemaining = () => {
    const later = exercise.sets.filter((item) => item.index > set.index && !item.completedAt);
    setApplied(true);
    void Promise.all(later.map((item) => setSetBands(item.id, bands, byId))).then(onChanged);
  };

  if (sets.length === 0 && bands.length === 0) {
    return (
      <MenuGroup title={t('bands.title')}>
        <Body>{t('bands.noSets')}</Body>
        <ActionButton icon="add" label={t('bands.createSet')} secondary onPress={() => router.push('/equipment')} />
      </MenuGroup>
    );
  }

  return (
    <MenuGroup title={t('bands.title')}>
      {bands.map((item, position) => {
        const band = byId.get(item.bandId);
        return (
          <View key={`${item.bandId}-${position}`} style={styles.bandRow}>
            <View style={styles.bandHead}>
              <View style={[styles.swatch, { backgroundColor: band?.color ?? palette.border, borderColor: palette.border }]} />
              <View style={styles.flex}>
                <Text style={styles.bandName}>{band ? band.name : t('bands.unknown')}</Text>
                <Text style={[styles.bandMeta, { color: palette.textMuted }]}>{band ? [band.setName, bandRange(band) || t('equipment.kgUnknown')].join(' · ') : ''}</Text>
              </View>
              <IconButton icon="close" label={t('bands.remove', { name: band?.name ?? '' })} tone="plain" onPress={() => save(bands.filter((_, index) => index !== position))} />
            </View>
            <Label>{t('bands.tension')}</Label>
            <SegmentedControl<string>
              value={String(item.tension)}
              onChange={(value) => save(bands.map((entry, index) => (index === position ? { ...entry, tension: Number(value) as Tension } : entry)))}
              options={TENSIONS.map((tension) => ({ value: String(tension), label: t(`bands.tension${tension}`) }))}
            />
          </View>
        );
      })}
      {bands.length > 0 ? (
        <Text style={[styles.assist, { color: palette.text }]}>
          {assist === null ? t('bands.assistUnknown') : t('bands.assist', { value: formatNumber(assist) })}
        </Text>
      ) : null}
      {picking && chosenSet ? (
        <View style={styles.picker}>
          {sets.length > 1 ? (
            <View style={styles.choices}>
              {sets.map((item) => <Chip key={item.id} label={item.name} selected={item.id === chosenSet.id} onPress={() => setBandSetId(item.id)} />)}
            </View>
          ) : <Label>{chosenSet.name}</Label>}
          <View style={styles.choices}>
            {chosenSet.bands.map((band) => (
              <Pressable
                key={band.id}
                accessibilityRole="button"
                accessibilityLabel={`${band.name} ${bandRange(band)}`.trim()}
                onPress={() => { tapFeedback(); setPicking(false); save([...bands, { bandId: band.id, tension: 2 }]); }}
                style={({ pressed }) => [styles.option, { borderColor: palette.border, backgroundColor: palette.surface, opacity: pressed ? 0.75 : 1 }]}
              >
                <View style={[styles.swatch, { backgroundColor: band.color, borderColor: palette.border }]} />
                <Text style={styles.optionText}>{band.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {!picking && sets.length > 0 ? <ActionButton icon="add" label={bands.length === 0 ? t('bands.add') : t('bands.addAnother')} secondary onPress={() => setPicking(true)} /> : null}
      {bands.length > 0 && exercise.sets.some((item) => item.index > set.index && !item.completedAt) ? (
        <ActionButton icon={applied ? 'checkmark' : 'copy-outline'} label={applied ? t('bands.applied') : t('bands.applyRemaining')} variant="ghost" onPress={applyToRemaining} />
      ) : null}
    </MenuGroup>
  );
}

const baseStyles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  bandRow: { gap: 8 },
  bandHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1 },
  bandName: { fontFamily: fonts.semibold, fontSize: 16 },
  bandMeta: { fontFamily: fonts.medium, fontSize: 13 },
  assist: { fontFamily: fonts.semibold, fontSize: 15 },
  picker: { gap: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  optionText: { fontFamily: fonts.medium, fontSize: 15 },
});
