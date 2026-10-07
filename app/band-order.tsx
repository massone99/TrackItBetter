import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { bandRanks } from '../src/domain/equipment';
import { moveItem } from '../src/domain/userProgram';
import { saveBandOrder } from '../src/features/equipment/repository';
import { bandRange, useEquipment } from '../src/features/equipment/useEquipment';
import { ReorderableList } from '../src/shared/components/ReorderableList';
import { Body, Card, PageHeading, Screen, Text } from '../src/shared/components/ui';
import { useTheme } from '../src/shared/theme/ThemeProvider';
import { fonts } from '../src/shared/theme/typography';
import { useScaledStyles } from '../src/shared/theme/useScaledStyles';

/** Every band of every band set in one strength order, lightest first; it compares assistance when kg are unknown. */
export default function BandOrderScreen() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const { catalog, reload } = useEquipment();
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  if (!catalog) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;

  const active = catalog.bandSets.filter((set) => !set.archived);
  const bands = new Map(active.flatMap((set) => set.bands.map((band) => [band.id, { ...band, setName: set.name }] as const)));
  const ordered = [...bandRanks(catalog.bandSets, catalog.bandOrder).keys()].flatMap((id) => (bands.has(id) ? [bands.get(id)!] : []));

  const move = async (from: number, to: number) => {
    setError(null);
    const visible = moveItem(ordered, from, to - from).map((band) => band.id);
    // Bands of archived sets keep their place after the visible ones.
    const hidden = [...bandRanks(catalog.bandSets, catalog.bandOrder).keys()].filter((id) => !bands.has(id));
    try { await saveBandOrder([...visible, ...hidden]); await reload(); } catch { setError(t('equipment.saveError')); }
  };

  return (
    <Screen>
      <PageHeading title={t('equipment.orderTitle')} subtitle={t('equipment.orderHelp')} />
      {error ? <Body style={{ color: palette.warning }}>{error}</Body> : null}
      <ReorderableList
        items={ordered}
        keyOf={(band) => band.id}
        nameOf={(band) => `${band.name} · ${band.setName}`}
        gap={8}
        onMove={(from, to) => void move(from, to)}
        renderRow={(band, index, row) => (
          <Card style={styles.row}>
            {row.handle}
            <Text style={[styles.rank, { color: palette.textMuted }]}>{index + 1}</Text>
            <View style={[styles.swatch, { backgroundColor: band.color, borderColor: palette.border }]} />
            <View style={styles.flex}>
              <Text style={styles.name}>{band.name}</Text>
              <Text style={[styles.meta, { color: palette.textMuted }]}>{[band.setName, bandRange(band) || t('equipment.kgUnknown')].join(' · ')}</Text>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, minHeight: 56 },
  rank: { fontFamily: fonts.semibold, fontSize: 14, minWidth: 20, textAlign: 'right', fontVariant: ['tabular-nums'] },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1 },
  flex: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.semibold, fontSize: 16 },
  meta: { fontFamily: fonts.medium, fontSize: 13 },
});
