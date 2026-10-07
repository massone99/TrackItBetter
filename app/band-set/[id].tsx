import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { BAND_COLORS, parseHexColor, type Band, type BandSet } from '../../src/domain/equipment';
import { moveItem } from '../../src/domain/userProgram';
import { newBand, saveBandSet, setBandSetArchived } from '../../src/features/equipment/repository';
import { bandRange, useEquipment } from '../../src/features/equipment/useEquipment';
import { ReorderableList } from '../../src/shared/components/ReorderableList';
import { ActionButton, Body, Card, EmptyState, IconButton, Label, PageHeading, Screen, Sheet, tapFeedback, Text, TextField } from '../../src/shared/components/ui';
import { goBack } from '../../src/shared/navigation/goBack';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';
import { parseNumberInput } from '../../src/shared/utils/format';

/** A band set: its name and its bands, lightest first. */
export default function BandSetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const { catalog, reload } = useEquipment();
  const [editing, setEditing] = useState<Band | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = catalog?.bandSets.find((item) => item.id === id) ?? null;
  const [name, setName] = useState<string | null>(null);

  if (!catalog) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (!set) return <Screen><PageHeading title={t('equipment.bandSetMissing')} /></Screen>;

  const save = async (next: BandSet) => {
    setError(null);
    try { await saveBandSet(next); await reload(); } catch { setError(t('equipment.saveError')); }
  };
  const saveName = () => {
    const typed = (name ?? set.name).trim();
    if (typed && typed !== set.name) void save({ ...set, name: typed });
    setName(null);
  };

  return (
    <Screen>
      <PageHeading title={set.name} subtitle={t('equipment.bandSetHelp')} />
      {error ? <Body style={{ color: palette.warning }}>{error}</Body> : null}
      <TextField label={t('equipment.bandSetName')} value={name ?? set.name} onChangeText={setName} onBlur={saveName} maxLength={40} />
      <Label>{t('equipment.bandsTitle')}</Label>
      {set.bands.length === 0 ? <EmptyState icon="git-commit-outline" title={t('equipment.noBands')} body={t('equipment.noBandsBody')} /> : null}
      <ReorderableList
        items={set.bands}
        keyOf={(band) => band.id}
        nameOf={(band) => band.name}
        gap={8}
        onMove={(from, to) => void save({ ...set, bands: moveItem(set.bands, from, to - from) })}
        renderRow={(band, _index, row) => (
          <Card style={styles.bandRow}>
            {set.bands.length > 1 ? row.handle : null}
            <Pressable accessibilityRole="button" accessibilityLabel={`${band.name} ${bandRange(band)}`.trim()} onPress={() => setEditing(band)} style={styles.bandMain}>
              <View style={[styles.swatch, { backgroundColor: band.color, borderColor: palette.border }]} />
              <View style={styles.flex}>
                <Text style={styles.bandName}>{band.name}</Text>
                <Text style={[styles.bandKg, { color: palette.textMuted }]}>{bandRange(band) || t('equipment.kgUnknown')}</Text>
              </View>
            </Pressable>
          </Card>
        )}
      />
      <ActionButton icon="add" label={t('equipment.addBand')} secondary onPress={() => {
        const band = newBand(t('equipment.bandDefaultName', { number: set.bands.length + 1 }), BAND_COLORS[set.bands.length % BAND_COLORS.length]);
        void save({ ...set, bands: [...set.bands, band] }).then(() => setEditing(band));
      }} />
      <ActionButton icon="archive-outline" label={t('equipment.archiveBandSet')} variant="ghost" onPress={() => void setBandSetArchived(set.id, true).then(() => goBack('/equipment'))} />

      {editing ? (
        <BandSheet
          key={editing.id}
          band={editing}
          onClose={() => setEditing(null)}
          onSave={(band) => { setEditing(null); void save({ ...set, bands: set.bands.map((item) => (item.id === band.id ? band : item)) }); }}
          onRemove={() => { setEditing(null); void save({ ...set, bands: set.bands.filter((item) => item.id !== editing.id) }); }}
        />
      ) : null}
    </Screen>
  );
}

function BandSheet({ band, onClose, onSave, onRemove }: { band: Band; onClose: () => void; onSave: (band: Band) => void; onRemove: () => void }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const [name, setName] = useState(band.name);
  const [color, setColor] = useState(band.color);
  const [hex, setHex] = useState(BAND_COLORS.some((swatch) => swatch === band.color) ? '' : band.color);
  const [minKg, setMinKg] = useState(band.minKg === null ? '' : String(band.minKg));
  const [maxKg, setMaxKg] = useState(band.maxKg === null ? '' : String(band.maxKg));
  const read = (value: string) => { const parsed = parseNumberInput(value, false); return parsed !== null && parsed >= 0 ? parsed : null; };
  const low = read(minKg);
  const high = read(maxKg);
  const invalid = !name.trim() || (low !== null && high !== null && low > high);
  return (
    <Sheet visible onClose={onClose} title={band.name}>
      <TextField label={t('equipment.bandName')} value={name} onChangeText={setName} placeholder={t('equipment.bandNamePlaceholder')} maxLength={30} />
      <Label>{t('equipment.bandColor')}</Label>
      <View style={styles.colors}>
        {BAND_COLORS.map((swatch) => (
          <Pressable
            key={swatch}
            accessibilityRole="button"
            accessibilityLabel={t('equipment.colorOption', { color: swatch })}
            accessibilityState={{ selected: swatch === color }}
            hitSlop={4}
            onPress={() => { tapFeedback(); setColor(swatch); }}
            style={[styles.colorOption, { backgroundColor: swatch, borderColor: swatch === color ? palette.accentStrong : palette.border, borderWidth: swatch === color ? 3 : 1 }]}
          />
        ))}
      </View>
      <View style={styles.hexRow}>
        <View style={[styles.hexSwatch, { backgroundColor: color, borderColor: palette.border }]} />
        <View style={styles.flex}>
          <TextField
            label={t('equipment.customColor')}
            value={hex}
            onChangeText={(value) => { setHex(value); const parsed = parseHexColor(value); if (parsed) setColor(parsed); }}
            placeholder="#2F80ED"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            error={hex.trim() && !parseHexColor(hex) ? t('equipment.customColorInvalid') : null}
          />
        </View>
      </View>
      <View style={styles.kgRow}>
        <View style={styles.flex}><TextField label={t('equipment.minKg')} value={minKg} onChangeText={setMinKg} keyboardType="decimal-pad" placeholder="–" /></View>
        <View style={styles.flex}><TextField label={t('equipment.maxKg')} value={maxKg} onChangeText={setMaxKg} keyboardType="decimal-pad" placeholder="–" /></View>
      </View>
      <Body>{low !== null && high !== null && low > high ? t('equipment.kgOrder') : t('equipment.kgHelp')}</Body>
      <ActionButton label={t('common.save')} disabled={invalid} onPress={() => onSave({ ...band, name: name.trim(), color, minKg: low, maxKg: high })} />
      <View style={styles.removeRow}>
        <IconButton icon="trash-outline" label={t('equipment.removeBand')} tone="plain" onPress={onRemove} />
        <Text style={[styles.removeText, { color: palette.textMuted }]}>{t('equipment.removeBandHint')}</Text>
      </View>
    </Sheet>
  );
}

const baseStyles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  bandMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1 },
  bandName: { fontFamily: fonts.semibold, fontSize: 16 },
  bandKg: { fontFamily: fonts.medium, fontSize: 14 },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorOption: { width: 44, height: 44, borderRadius: 22 },
  kgRow: { flexDirection: 'row', gap: 12 },
  hexRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  hexSwatch: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, marginBottom: 2 },
  removeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  removeText: { flex: 1, fontFamily: fonts.medium, fontSize: 13 },
});
