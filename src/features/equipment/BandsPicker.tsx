import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { setAssistKg, type Band, type SetBand, type Tension } from '../../domain/equipment';
import { ActionButton, Body, Chip, Icon, MenuGroup, tapFeedback, Text } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatNumber } from '../../shared/utils/format';
import { RenameBandSheet } from './RenameBandSheet';
import { bandRange, bandsById, useEquipment } from './useEquipment';
import { MIN_TOUCH_TARGET, radii, spacing } from '../../shared/theme/tokens';

const TENSIONS: Tension[] = [1, 2, 3];

/**
 * Chooses resistance bands from the user's band sets, each with how far it is stretched (1–3), and
 * shows the kg of help. One list of the bands of a set: a tap picks or drops a band, a picked band
 * shows its tension (1·2·3) on the same row, a held press renames it. Controlled: what to do with
 * the choice (save it on a set, use it in the estimator) is up to `onChange`; `children` add actions
 * under the list.
 */
export function BandsPicker({ bands, onChange, children }: { bands: readonly SetBand[]; onChange: (bands: SetBand[]) => void; children?: ReactNode }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const { catalog, reload } = useEquipment();
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [bandSetId, setBandSetId] = useState<string | null>(null);
  if (!catalog) return null;
  const byId = bandsById(catalog);
  const sets = catalog.bandSets.filter((item) => !item.archived && item.bands.length > 0);
  const assist = setAssistKg(bands, byId);
  const save = onChange;

  if (sets.length === 0 && bands.length === 0) {
    return (
      <MenuGroup title={t('bands.title')}>
        <Body>{t('bands.noSets')}</Body>
        <ActionButton icon="add" label={t('bands.createSet')} secondary onPress={() => router.push('/equipment')} />
      </MenuGroup>
    );
  }

  // Opens on the set the chosen bands come from, else the first one.
  const firstChosenSet = sets.find((item) => item.bands.some((band) => bands.some((chosen) => chosen.bandId === band.id)));
  const chosenSet = sets.find((item) => item.id === bandSetId) ?? firstChosenSet ?? sets[0] ?? null;
  // Picked bands from another set (or no longer in the catalogue) stay listed first, so they can be changed or dropped.
  const others = bands.filter((item) => !chosenSet?.bands.some((band) => band.id === item.bandId));
  const toggle = (bandId: string) => {
    const at = bands.findIndex((item) => item.bandId === bandId);
    save(at >= 0 ? bands.filter((_, index) => index !== at) : [...bands, { bandId, tension: 2 }]);
  };
  const setTension = (bandId: string, tension: Tension) => save(bands.map((item) => (item.bandId === bandId ? { ...item, tension } : item)));

  const row = (bandId: string, band: Band | undefined) => {
    const picked = bands.find((item) => item.bandId === bandId) ?? null;
    return (
      <BandRow
        key={bandId}
        name={band ? band.name : t('bands.unknown')}
        meta={band ? bandRange(band) || t('equipment.kgUnknown') : ''}
        color={band?.color ?? palette.border}
        tension={picked?.tension ?? null}
        tensionLabel={(tension) => t(`bands.tension${tension}`)}
        onToggle={() => toggle(bandId)}
        onTension={(tension) => setTension(bandId, tension)}
        onRename={band ? () => setRenaming({ id: band.id, name: band.name }) : undefined}
        renameLabel={band ? t('equipment.renameBandLabel', { name: band.name }) : ''}
      />
    );
  };

  return (
    <MenuGroup title={t('bands.title')}>
      <Text style={[styles.assist, { color: bands.length === 0 ? palette.textMuted : palette.text }]}>
        {bands.length === 0 ? t('bands.none') : assist === null ? t('bands.assistUnknown') : t('bands.assist', { value: formatNumber(assist) })}
      </Text>
      {sets.length > 1 && chosenSet ? (
        <View style={styles.choices}>
          {sets.map((item) => <Chip key={item.id} label={item.name} selected={item.id === chosenSet.id} onPress={() => setBandSetId(item.id)} />)}
        </View>
      ) : null}
      <View style={styles.list}>
        {others.map((item) => row(item.bandId, byId.get(item.bandId)))}
        {chosenSet?.bands.map((band) => row(band.id, band))}
      </View>
      {children}
      <RenameBandSheet band={renaming} onClose={() => setRenaming(null)} onDone={() => void reload()} />
    </MenuGroup>
  );
}

/** One band: the row picks or drops it; once picked, its tension sits on the right. */
function BandRow({ name, meta, color, tension, tensionLabel, onToggle, onTension, onRename, renameLabel }: {
  name: string;
  meta: string;
  color: string;
  tension: Tension | null;
  tensionLabel: (tension: Tension) => string;
  onToggle: () => void;
  onTension: (tension: Tension) => void;
  onRename?: () => void;
  renameLabel: string;
}) {
  const { palette } = useTheme();
  const ink = useInk();
  const styles = useScaledStyles(baseStyles);
  const picked = tension !== null;
  return (
    <View style={[styles.row, { borderBottomColor: palette.border }, picked && { backgroundColor: palette.accentSoft }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${name}${meta ? `, ${meta}` : ''}`}
        accessibilityState={{ checked: picked }}
        accessibilityActions={onRename ? [{ name: 'longpress', label: renameLabel }] : undefined}
        onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onRename?.(); }}
        onPress={() => { tapFeedback(); onToggle(); }}
        onLongPress={onRename ? () => { tapFeedback(); onRename(); } : undefined}
        delayLongPress={450}
        style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}
      >
        <View style={[styles.check, { borderColor: picked ? palette.accentStrong : palette.textMuted, backgroundColor: picked ? palette.accentStrong : 'transparent' }]}>
          {picked ? <Icon name="checkmark" size={14} color={palette.accentText} /> : null}
        </View>
        <View style={[styles.swatch, { backgroundColor: color, borderColor: ink }]} />
        <View style={styles.flex}>
          <Text style={[styles.bandName, { color: palette.text }]}>{name}</Text>
          {meta || picked ? <Text style={[styles.bandMeta, { color: palette.textMuted }]}>{[meta, picked ? tensionLabel(tension) : null].filter(Boolean).join(' · ')}</Text> : null}
        </View>
      </Pressable>
      {picked ? (
        <View style={[styles.tensions, { borderColor: ink }]}>
          {TENSIONS.map((value, index) => {
            const selected = value === tension;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${tensionLabel(value)}`}
                accessibilityState={{ selected }}
                hitSlop={{ top: 8, bottom: 8 }}
                onPress={() => { tapFeedback(); onTension(value); }}
                style={[styles.tension, index > 0 && { borderLeftWidth: 1, borderLeftColor: palette.border }, { backgroundColor: selected ? palette.accentStrong : palette.surface }]}
              >
                <Text style={[styles.tensionText, { color: selected ? palette.accentText : palette.text }]}>{value}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  assist: { fontFamily: fonts.monoSemibold, fontSize: 15 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  list: {},
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm, paddingRight: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  rowMain: { flexGrow: 1, flexShrink: 1, flexBasis: 140, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH_TARGET + spacing.sm, paddingLeft: spacing.sm },
  check: { width: 20, height: 20, borderRadius: radii.small, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 14, height: 14, borderRadius: radii.small, borderWidth: 1 },
  bandName: { fontFamily: fonts.semibold, fontSize: 15 },
  bandMeta: { fontFamily: fonts.mono, fontSize: 12 },
  // 32 dp drawn, 48 dp to touch with the hitSlop; wraps under the name at large text.
  tensions: { flexDirection: 'row', marginLeft: 'auto', marginVertical: spacing.sm, borderWidth: 1, borderRadius: radii.control, overflow: 'hidden' },
  tension: { minWidth: 36, minHeight: MIN_TOUCH_TARGET - 2 * spacing.sm, alignItems: 'center', justifyContent: 'center' },
  tensionText: { fontFamily: fonts.monoSemibold, fontSize: 15 },
});
