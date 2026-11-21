import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { BAND_COLORS, parseHexColor, type Band, type BandSet } from '../../src/domain/equipment';
import { moveItem } from '../../src/domain/userProgram';
import { newBand, saveBandSet, setBandSetArchived } from '../../src/features/equipment/repository';
import { bandRange, useEquipment } from '../../src/features/equipment/useEquipment';
import { ReorderableList } from '../../src/shared/components/ReorderableList';
import { ActionButton, Body, Card, EmptyState, Icon, Label, ListGroup, ListRow, PageHeading, Screen, Sheet, tapFeedback, Text, TextField } from '../../src/shared/components/ui';
import { goBack } from '../../src/shared/navigation/goBack';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';
import { useSaveOnLeave } from '../../src/shared/forms/useSaveOnLeave';
import { parseNumberInput, sanitizeNumberInput } from '../../src/shared/utils/format';
import { radii } from '../../src/shared/theme/tokens';

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
  // A name typed but not yet saved is saved on the way out (back pressed with the keyboard open never blurs the field).
  const typedName = name?.trim() ?? '';
  const { allowLeave } = useSaveOnLeave({
    dirty: set !== null && typedName !== '' && typedName !== set.name,
    save: async () => {
      if (!set) return true;
      try { await saveBandSet({ ...set, name: typedName }); return true; } catch { return false; }
    },
  });
  void allowLeave;

  if (!catalog) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (!set) return <Screen><PageHeading title={t('equipment.bandSetMissing')} /></Screen>;

  const active = set.bands.filter((band) => !band.archived);
  const archived = set.bands.filter((band) => band.archived);
  const editIndex = active.findIndex((band) => band.id === editing?.id);
  const move = (from: number, to: number) => {
    const moved = moveItem(active, from, to - from);
    let index = 0;
    return save({ ...set, bands: set.bands.map((band) => band.archived ? band : moved[index++]) });
  };

  async function save(next: BandSet) {
    setError(null);
    try { await saveBandSet(next); await reload(); return true; } catch { setError(t('equipment.saveError')); return false; }
  }
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
      {active.length === 0 ? <EmptyState icon="git-commit-outline" title={t('equipment.noBands')} body={t('equipment.noBandsBody')} /> : null}
      <ReorderableList
        items={active}
        keyOf={(band) => band.id}
        nameOf={(band) => band.name}
        gap={8}
        onMove={(from, to) => void move(from, to)}
        renderRow={(band, index, row) => (
          <Card style={styles.bandRow}>
            {active.length > 1 ? row.handle : null}
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('equipment.renameBandLabel', { name: band.name })} ${bandRange(band)}`.trim()} onPress={() => setEditing(band)} style={styles.bandMain}>
              <View style={[styles.swatch, { backgroundColor: band.color, borderColor: palette.border }]} />
              <View style={styles.flex}>
                <Text style={styles.bandName}>{t('equipment.bandRank', { position: index + 1, name: band.name })}</Text>
                <Text style={[styles.bandKg, { color: palette.textMuted }]}>{bandRange(band) || t('equipment.kgUnknown')}</Text>
              </View>
              <Icon name="create-outline" size={20} color={palette.textMuted} />
            </Pressable>
          </Card>
        )}
      />
      <ActionButton icon="add" label={t('equipment.addBand')} secondary onPress={() => {
        const band = newBand(t('equipment.bandDefaultName', { number: set.bands.length + 1 }), BAND_COLORS[set.bands.length % BAND_COLORS.length]);
        void save({ ...set, bands: [...set.bands, band] }).then((saved) => { if (saved) setEditing(band); });
      }} />
      {archived.length > 0 ? (
        <>
          <Label>{t('equipment.archivedBands')}</Label>
          <ListGroup>
            {archived.map((band) => (
              <ListRow key={band.id} icon="archive-outline" title={band.name} subtitle={t('equipment.restore')} onPress={() => void save({ ...set, bands: set.bands.map((item) => item.id === band.id ? { ...item, archived: false } : item) })} />
            ))}
          </ListGroup>
        </>
      ) : null}
      <ActionButton icon="archive-outline" label={t('equipment.archiveBandSet')} variant="ghost" onPress={() => void setBandSetArchived(set.id, true).then(() => goBack('/equipment'))} />

      {editing ? (
        <BandSheet
          key={editing.id}
          band={editing}
          onClose={() => setEditing(null)}
          onSave={(band) => { void save({ ...set, bands: set.bands.map((item) => (item.id === band.id ? band : item)) }).then((saved) => { if (saved) setEditing(null); }); }}
          onMoveUp={editIndex > 0 ? () => { void move(editIndex, editIndex - 1); } : undefined}
          onMoveDown={editIndex >= 0 && editIndex < active.length - 1 ? () => { void move(editIndex, editIndex + 1); } : undefined}
          onRemove={() => { void save({ ...set, bands: set.bands.map((item) => item.id === editing.id ? { ...item, archived: true } : item) }).then((saved) => { if (saved) setEditing(null); }); }}
        />
      ) : null}
    </Screen>
  );
}

function BandSheet({ band, onClose, onSave, onRemove, onMoveUp, onMoveDown }: { band: Band; onClose: () => void; onSave: (band: Band) => void; onRemove: () => void; onMoveUp?: () => void; onMoveDown?: () => void }) {
  const { t } = useTranslation();
  const { palette, largeText } = useTheme();
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
      <View style={[styles.kgRow, largeText && styles.kgStack]}>
        <View style={styles.flex}><TextField label={t('equipment.minKg')} value={minKg} onChangeText={(text) => setMinKg(sanitizeNumberInput(text))} keyboardType="decimal-pad" placeholder="–" /></View>
        <View style={styles.flex}><TextField label={t('equipment.maxKg')} value={maxKg} onChangeText={(text) => setMaxKg(sanitizeNumberInput(text))} keyboardType="decimal-pad" placeholder="–" /></View>
      </View>
      <Body>{low !== null && high !== null && low > high ? t('equipment.kgOrder') : t('equipment.kgHelp')}</Body>
      <ActionButton label={t('common.save')} disabled={invalid} onPress={() => onSave({ ...band, name: name.trim(), color, minKg: low, maxKg: high })} />
      {onMoveUp || onMoveDown ? (
        <View style={styles.orderActions}>
          <ActionButton icon="arrow-up" label={t('equipment.lighterPosition')} secondary disabled={!onMoveUp} onPress={() => onMoveUp?.()} />
          <ActionButton icon="arrow-down" label={t('equipment.strongerPosition')} secondary disabled={!onMoveDown} onPress={() => onMoveDown?.()} />
        </View>
      ) : null}
      <ActionButton icon="archive-outline" label={t('equipment.archiveBand')} variant="ghost" onPress={onRemove} />
      <Body>{t('equipment.archiveBandHint')}</Body>
    </Sheet>
  );
}

const baseStyles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  bandMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  swatch: { width: 28, height: 28, borderRadius: radii.control, borderWidth: 1 },
  bandName: { fontFamily: fonts.semibold, fontSize: 16 },
  bandKg: { fontFamily: fonts.medium, fontSize: 14 },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorOption: { width: 44, height: 44, borderRadius: radii.control },
  kgRow: { flexDirection: 'row', gap: 12 },
  kgStack: { flexDirection: 'column' },
  orderActions: { gap: 8 },
  hexRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  hexSwatch: { width: 48, height: 48, borderRadius: radii.control, borderWidth: 1, marginBottom: 2 },
});
