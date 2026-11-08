import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, Text, tapFeedback } from '../../shared/components/ui';
import { useInk } from '../../shared/theme/ink';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { MIN_TOUCH_TARGET, radii, spacing } from '../../shared/theme/tokens';

/** Band swatches and the assistance ("15" kg, shown as "−15"); `assist` is null while unknown. */
export interface LedgerBands { colors: string[]; assist: string | null }

export interface LedgerCommon {
  /** "W" for a warm-up, else the working number. */
  label: string;
  /** "L" / "R" for a pair side. */
  side?: 'L' | 'R' | null;
  warmup?: boolean;
}

export interface LedgerHeaderProps {
  /** REPS / SEC / M (use `t('ledger.repsCol')` etc.). */
  valueLabel: string;
  /** Hide the KG column when the exercise has no load. */
  withLoad?: boolean;
}

export interface LedgerRowProps extends LedgerCommon {
  value: string;
  rpe?: string | null;
  /** Load in kg, already formatted; null hides it. */
  load?: string | null;
  bands?: LedgerBands | null;
  withLoad?: boolean;
  onOpen: () => void;
  onMenu: () => void;
}

export interface LedgerChip { onPress: () => void; open?: boolean }

export interface LedgerActiveRowProps extends LedgerCommon {
  withLoad: boolean;
  /** A clock value (m:ss) needs more room than reps: the value field takes the larger share of the row. */
  valueWide?: boolean;
  valueField: ReactNode;
  valueDown?: ReactNode;
  valueUp?: ReactNode;
  loadField?: ReactNode;
  loadDown?: ReactNode;
  loadUp?: ReactNode;
  onComplete: () => void;
  /** Replaces the complete button (timed sets pass their hold button). */
  completeSlot?: ReactNode;
  rpe?: (LedgerChip & { value: string | null; target?: string | null }) | null;
  form?: (LedgerChip & { value: string | null }) | null;
  rom?: (LedgerChip & { value: string | null }) | null;
  bands?: (LedgerChip & LedgerBands) | null;
  rest?: (LedgerChip & { value: string; filled?: boolean }) | null;
  note?: (LedgerChip & { text: string | null }) | null;
  video?: (LedgerChip & { clips: number }) | null;
  /** The open RPE / form / ROM picker. */
  panel?: ReactNode;
}

function setText(label: string, side: 'L' | 'R' | null | undefined) {
  return side ? `${label}${side}` : label;
}

function useSetName({ label, side, warmup }: LedgerCommon) {
  const { t } = useTranslation();
  return warmup ? `${t('ledger.warmup')} ${side ?? ''}`.trim() : t('ledger.set', { label: setText(label, side) });
}

/** Column header of a ledger: SET | value | KG | DONE. */
export function LedgerHeader({ valueLabel, withLoad = true }: LedgerHeaderProps) {
  const { t } = useTranslation();
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const ink = useInk();
  const cell = [styles.headText, { color: palette.textMuted }];
  return (
    <View style={[styles.header, { borderBottomColor: ink }]} accessibilityRole="header">
      <Text style={[styles.colSet, ...cell]}>{t('ledger.setCol')}</Text>
      <Text style={[styles.colField, ...cell]}>{valueLabel}</Text>
      {withLoad ? <Text style={[styles.colField, ...cell]}>{t('ledger.kgCol')}</Text> : null}
      <Text style={[styles.colDone, ...cell]}>{t('ledger.doneCol')}</Text>
    </View>
  );
}

function Swatches({ colors }: { colors: string[] }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <>
      {colors.map((color, index) => <View key={`${color}-${index}`} style={[styles.swatch, { backgroundColor: color, borderColor: palette.border }]} />)}
    </>
  );
}

function LoadCell({ load, bands, muted }: { load?: string | null; bands?: LedgerBands | null; muted: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const color = muted ? palette.textMuted : palette.text;
  if (bands && bands.colors.length > 0) {
    return (
      <View style={[styles.colField, styles.bandsCell]}>
        <Swatches colors={bands.colors} />
        <Text style={[styles.figure, { color }]}>{bands.assist ? `−${bands.assist}` : '?'}</Text>
      </View>
    );
  }
  return <Text style={[styles.colField, styles.figure, { color }]}>{load ?? '—'}</Text>;
}

function summary(t: (key: string, options?: Record<string, unknown>) => string, props: LedgerRowProps, key: 'rowDone' | 'rowUpcoming', name: string) {
  const parts = [props.value];
  if (props.bands && props.bands.colors.length > 0) parts.push(props.bands.assist ? t('ledger.withAssist', { value: props.bands.assist }) : t('bands.unknown'));
  else if (props.withLoad !== false && props.load) parts.push(t('ledger.withLoad', { value: props.load }));
  if (props.rpe) parts.push(t('ledger.withRpe', { value: props.rpe }));
  return t(`ledger.${key}`, { set: name, value: parts.join(', ') });
}

function StaticRow(props: LedgerRowProps & { done: boolean }) {
  const { t } = useTranslation();
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const name = useSetName(props);
  const { done, withLoad = true } = props;
  const muted = !done;
  const color = muted ? palette.textMuted : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={summary(t, props, done ? 'rowDone' : 'rowUpcoming', name)}
      accessibilityHint={t('ledger.reopenHint')}
      accessibilityState={{ checked: done }}
      onPress={() => { tapFeedback(); props.onOpen(); }}
      onLongPress={() => { tapFeedback(); props.onMenu(); }}
      delayLongPress={450}
      style={[styles.row, { borderBottomColor: palette.border }]}
    >
      <View style={styles.colSet}>
        <Text style={[styles.setLabel, { color }, props.warmup && styles.warmup]}>{setText(props.label, props.side)}</Text>
      </View>
      <View style={[styles.colField, styles.valueCell]}>
        <Text style={[styles.figure, { color }]}>{props.value}</Text>
        {props.rpe ? <Text style={[styles.small, { color: palette.textMuted }]}>{` · ${t('ledger.withRpe', { value: props.rpe })}`}</Text> : null}
      </View>
      {withLoad ? <LoadCell load={props.load} bands={props.bands} muted={muted} /> : null}
      <View style={styles.colDone}>
        {done
          ? <Icon name="checkmark" size={22} color={palette.success} />
          : <View style={[styles.box, { borderColor: palette.textMuted }]} />}
      </View>
    </Pressable>
  );
}

/** A finished set: tap reopens, hold opens the set menu. */
export function LedgerDoneRow(props: LedgerRowProps) {
  return <StaticRow {...props} done />;
}

/** A set still to do, muted. */
export function LedgerUpcomingRow(props: LedgerRowProps) {
  return <StaticRow {...props} done={false} />;
}

function Chip({ label, filled, open, onPress, colors }: { label: string; filled: boolean; open?: boolean; onPress: () => void; colors?: string[] }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const ink = useInk();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open ?? false }}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      onPress={() => { tapFeedback(); onPress(); }}
      style={[styles.chip, filled ? { borderColor: ink, borderStyle: 'solid' } : { borderColor: palette.textMuted, borderStyle: 'dashed' }, open && { backgroundColor: palette.surface }]}
    >
      {colors && colors.length > 0 ? <Swatches colors={colors} /> : null}
      <Text numberOfLines={1} style={[styles.chipText, { color: filled ? palette.text : palette.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

function Field({ children, down, up, stacked, wide = false }: { children: ReactNode; down?: ReactNode; up?: ReactNode; stacked: boolean; wide?: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const ink = useInk();
  const { palette } = useTheme();
  return (
    <View style={[styles.fieldBox, stacked ? styles.fieldStacked : [styles.colField, wide && styles.colWide], { borderColor: ink, backgroundColor: palette.surface }]}>
      {down}
      <View style={styles.fieldValue}>{children}</View>
      {up}
    </View>
  );
}

/** The set in hand: value and load fields, the complete button, then the chips and an optional open picker. */
export function LedgerActiveRow(props: LedgerActiveRowProps) {
  const { t } = useTranslation();
  const styles = useScaledStyles(baseStyles);
  const { palette, largeText } = useTheme();
  const name = useSetName(props);
  const complete = props.completeSlot ?? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('ledger.complete')}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      onPress={() => { tapFeedback('success'); props.onComplete(); }}
      style={[styles.completeBtn, largeText && styles.completeStacked, { backgroundColor: palette.accent }]}
    >
      <Icon name="checkmark" size={24} color={palette.accentText} />
      {largeText ? <Text style={[styles.completeText, { color: palette.accentText }]}>{t('ledger.complete')}</Text> : null}
    </Pressable>
  );
  const { rpe, form, rom, bands, rest, note, video } = props;
  const chips = (
    <View style={[styles.chips, largeText && styles.chipsFlush]}>
      {rpe ? (
        <Chip
          label={`${rpe.value !== null ? t('ledger.withRpe', { value: rpe.value }) : t('ledger.rpe')}${rpe.target ? ` @${rpe.target}` : ''}`}
          filled={rpe.value !== null} open={rpe.open} onPress={rpe.onPress}
        />
      ) : null}
      {form ? <Chip label={form.value !== null ? `${t('ledger.form')} ${form.value}` : t('ledger.form')} filled={form.value !== null} open={form.open} onPress={form.onPress} /> : null}
      {rom ? <Chip label={rom.value !== null ? `${t('ledger.rom')} ${rom.value}` : t('ledger.rom')} filled={rom.value !== null} open={rom.open} onPress={rom.onPress} /> : null}
      {bands ? (
        bands.colors.length > 0
          ? <Chip label={`${bands.assist ? `−${bands.assist} ` : '? '}${t('ledger.kgCol')}`} colors={bands.colors} filled open={bands.open} onPress={bands.onPress} />
          : <Chip label={t('ledger.addBands')} filled={false} open={bands.open} onPress={bands.onPress} />
      ) : null}
      {rest ? <Chip label={t('ledger.rest', { value: rest.value })} filled={rest.filled ?? false} open={rest.open} onPress={rest.onPress} /> : null}
      {note ? <Chip label={note.text ? note.text : t('ledger.addNote')} filled={Boolean(note.text)} open={note.open} onPress={note.onPress} /> : null}
      {video ? <Chip label={video.clips > 0 ? t('ledger.clips', { count: video.clips }) : t('ledger.video')} filled={video.clips > 0} open={video.open} onPress={video.onPress} /> : null}
    </View>
  );
  return (
    <View
      accessibilityLabel={name}
      style={[styles.active, { backgroundColor: palette.accentSoft, borderTopColor: palette.accentStrong, borderBottomColor: palette.accentStrong }]}
    >
      {largeText ? (
        <View style={styles.stack}>
          <Text style={[styles.setLabel, styles.activeLabel, { color: palette.text }]}>{name}</Text>
          <Field stacked down={props.valueDown} up={props.valueUp}>{props.valueField}</Field>
          {props.withLoad ? <Field stacked down={props.loadDown} up={props.loadUp}>{props.loadField}</Field> : null}
          {complete}
        </View>
      ) : (
        <View style={styles.activeMain}>
          <View style={styles.colSet}>
            <Text style={[styles.setLabel, styles.activeLabel, props.warmup && styles.warmup, { color: palette.text }]}>{setText(props.label, props.side)}</Text>
          </View>
          <Field stacked={false} wide={props.valueWide} down={props.valueDown} up={props.valueUp}>{props.valueField}</Field>
          {props.withLoad ? <Field stacked={false} down={props.loadDown} up={props.loadUp}>{props.loadField}</Field> : null}
          <View style={styles.colDone}>{complete}</View>
        </View>
      )}
      {chips}
      {props.panel}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32, borderBottomWidth: StyleSheet.hairlineWidth },
  headText: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16 },
  colSet: { width: 32, alignItems: 'flex-start', justifyContent: 'center' },
  colField: { flex: 1, minWidth: 0 },
  colWide: { flex: 1.6 },
  colDone: { width: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.xs },
  valueCell: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
  bandsCell: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  setLabel: { fontFamily: fonts.monoSemibold, fontSize: 15, lineHeight: 22 },
  activeLabel: { fontFamily: fonts.monoBold },
  warmup: { textDecorationLine: 'underline', textDecorationStyle: 'dashed' },
  figure: { fontFamily: fonts.mono, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16 },
  box: { width: 20, height: 20, borderWidth: 1, borderRadius: radii.small },
  swatch: { width: 12, height: 12, borderRadius: radii.small, borderWidth: 1 },
  active: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: spacing.sm, gap: spacing.sm },
  activeMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stack: { gap: spacing.sm, paddingHorizontal: spacing.xs },
  fieldBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radii.control, minHeight: MIN_TOUCH_TARGET },
  fieldStacked: { alignSelf: 'stretch' },
  fieldValue: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  completeBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.control, flexDirection: 'row', gap: spacing.sm },
  completeStacked: { alignSelf: 'stretch', minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md },
  completeText: { fontFamily: fonts.monoBold, fontSize: 15, lineHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 40, alignItems: 'center' },
  chipsFlush: { paddingLeft: spacing.xs },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 32, paddingHorizontal: spacing.sm, borderWidth: 1, borderRadius: radii.control, maxWidth: '100%' },
  chipText: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, flexShrink: 1 },
});
