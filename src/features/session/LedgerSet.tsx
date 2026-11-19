import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, Text, tapFeedback } from '../../shared/components/ui';
import { ChipsFold } from './ChipsFold';
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
  /** The next set to fill while another one is open: blue tint, rail, number tag and a NEXT mark. */
  next?: boolean;
}

export interface LedgerChip { onPress: () => void; open?: boolean }

export interface LedgerActiveRowProps extends LedgerCommon {
  withLoad: boolean;
  /** Folds the set in hand to a one-line row (its number becomes the button; a tap on empty space does it too). */
  onFold?: () => void;
  /** Held press on the row: the set menu, as its three dots. */
  onMenu?: () => void;
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
  /** A done set opened to edit (green) or the set to fill now (blue). */
  tone?: 'next' | 'edit';
  /** The exercise uses bands: the band line shows on the set in hand even when it has none yet. */
  bandsInUse?: boolean;
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
        {bands.assist ? <Text style={[styles.figure, { color }]}>{`−${bands.assist}`}</Text> : null}
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

/** The set number in a filled square: green while a done set is edited, blue for the set to fill. */
function NumberTag({ text, tone, warmup }: { text: string; tone: 'next' | 'edit'; warmup?: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <View style={[styles.numberTag, { backgroundColor: tone === 'edit' ? palette.success : palette.accentStrong }]}>
      <Text style={[styles.numberTagText, warmup && styles.warmup, { color: tone === 'edit' ? palette.successText : palette.accentText }]}>{text}</Text>
    </View>
  );
}

function StaticRow(props: LedgerRowProps & { done: boolean }) {
  const { t } = useTranslation();
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const name = useSetName(props);
  const { done, withLoad = true } = props;
  const next = !done && props.next;
  const muted = !done && !next;
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
      style={[styles.row, { borderBottomColor: palette.border }, next && [styles.railed, { backgroundColor: palette.accentSoft, borderLeftColor: palette.accentStrong }]]}
    >
      <View style={styles.colSet}>
        {next
          ? <NumberTag text={setText(props.label, props.side)} tone="next" warmup={props.warmup} />
          : <Text style={[styles.setLabel, { color }, props.warmup && styles.warmup]}>{setText(props.label, props.side)}</Text>}
      </View>
      <View style={[styles.colField, styles.valueCell]}>
        <Text style={[styles.figure, { color }]}>{props.value}</Text>
        {props.rpe ? <Text style={[styles.small, { color: palette.textMuted }]}>{` · ${t('ledger.withRpe', { value: props.rpe })}`}</Text> : null}
        {next ? <Text style={[styles.statusTag, { color: palette.accentStrong }]}>{`  ${t('ledger.next')}`}</Text> : null}
      </View>
      {withLoad ? <LoadCell load={props.load} bands={props.bands} muted={muted} /> : null}
      <View style={styles.colDone}>
        {done
          ? <Icon name="checkmark" size={22} color={palette.success} />
          : <View style={[styles.box, next ? [styles.boxNext, { borderColor: palette.accentStrong, backgroundColor: palette.surface }] : { borderColor: palette.textMuted }]} />}
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

function Field({ children, down, up, stacked }: { children: ReactNode; down?: ReactNode; up?: ReactNode; stacked: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const ink = useInk();
  const { palette } = useTheme();
  return (
    <View style={[styles.fieldBox, stacked ? styles.fieldStacked : styles.colField, { borderColor: ink, backgroundColor: palette.surface }]}>
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
      hitSlop={6}
      onPress={() => { tapFeedback('success'); props.onComplete(); }}
      style={[styles.completeBtn, largeText && styles.completeStacked, { backgroundColor: palette.accent }]}
    >
      <Icon name="checkmark" size={24} color={palette.accentText} />
      {largeText ? <Text style={[styles.completeText, { color: palette.accentText }]}>{t('ledger.complete')}</Text> : null}
    </Pressable>
  );
  const { rpe, form, rom, bands, rest, note, video } = props;
  const tone = props.tone ?? 'next';
  // The chips fold behind one quiet line, folded by default: the set reads as its numbers, the extras stay one tap away.
  const [chipsOpen, setChipsOpen] = useState(false);
  const summary = [
    rpe?.value != null ? t('ledger.withRpe', { value: rpe.value }) : null,
    form?.value != null ? `${t('ledger.form')} ${form.value}` : null,
    rom?.value != null ? `${t('ledger.rom')} ${rom.value}` : null,
    rest?.filled ? t('ledger.rest', { value: rest.value }) : null,
    note?.text ? t('logger.noteChip') : null,
    video && video.clips > 0 ? t('ledger.clips', { count: video.clips }) : null,
  ].filter(Boolean).join(' · ');
  const hasChips = Boolean(rpe || form || rom || bands || rest || note || video);
  const fold = hasChips ? (
    <ChipsFold
      label={t('logger.chipsFold').toUpperCase()}
      summary={summary}
      record={false}
      open={chipsOpen}
      onPress={() => { tapFeedback(); setChipsOpen(!chipsOpen); }}
      style={styles.chipsFold}
    />
  ) : null;
  const chips = !chipsOpen ? null : (
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
    // A tap on empty space folds the set, a held press opens its menu; buttons, fields and chips keep their own taps.
    // Screen readers fold it from the number button instead (this container is not an accessibility element).
    <Pressable
      accessible={false}
      accessibilityRole="none"
      onPress={props.onFold ? () => { tapFeedback(); props.onFold?.(); } : undefined}
      onLongPress={props.onMenu}
      delayLongPress={450}
      style={[styles.active, styles.railedActive, { backgroundColor: tone === 'edit' ? palette.successSoft : palette.accentSoft, borderLeftColor: tone === 'edit' ? palette.success : palette.accentStrong, borderBottomColor: palette.border }]}
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
          {props.onFold ? (
            // The number folds the set to one row like the others, so every set of the card can be folded at once.
            <Pressable accessibilityRole="button" accessibilityLabel={t('ledger.fold', { label: setText(props.label, props.side) })} hitSlop={{ top: 4, bottom: 4, left: 8, right: 4 }} onPress={() => { tapFeedback(); props.onFold?.(); }} style={({ pressed }) => [styles.colSet, styles.foldTap, pressed && { opacity: 0.6 }]}>
              <NumberTag text={setText(props.label, props.side)} tone={tone} warmup={props.warmup} />
            </Pressable>
          ) : (
            <View style={styles.colSet}>
              <NumberTag text={setText(props.label, props.side)} tone={tone} warmup={props.warmup} />
            </View>
          )}
          <Field stacked={false} down={props.valueDown} up={props.valueUp}>{props.valueField}</Field>
          {props.withLoad ? <Field stacked={false} down={props.loadDown} up={props.loadUp}>{props.loadField}</Field> : null}
          <View style={styles.colDone}>{complete}</View>
        </View>
      )}
      <View style={[styles.subRow, largeText && styles.chipsFlush]}>
      {bands && (bands.colors.length > 0 || props.bandsInUse) ? (
        // Bands stay in view on the set in hand: what helps, how much, one tap to change.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('ledger.bands')} ${bands.assist ? t('ledger.withAssist', { value: bands.assist }) : ''}`.trim()}
          hitSlop={{ top: 8, bottom: 8 }}
          onPress={() => { tapFeedback(); bands.onPress(); }}
          style={({ pressed }) => [styles.bandLine, pressed && { opacity: 0.6 }]}
        >
          {bands.colors.length > 0 ? <Swatches colors={bands.colors} /> : null}
          <Text style={[styles.bandText, { color: bands.colors.length > 0 ? palette.text : palette.textMuted }]}>{bands.colors.length === 0 ? t('ledger.noBands') : bands.assist ? `−${bands.assist} ${t('ledger.kgCol')}` : ''}</Text>
          <Text style={[styles.statusTag, { color: palette.accentStrong }]}>{bands.colors.length > 0 ? t('ledger.editBands') : t('ledger.addBands')}</Text>
        </Pressable>
      ) : null}
        {fold}
      </View>
      {chips}
      {props.panel}
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  // Every row starts 8 dp in, so the set number does not touch the card's edge.
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32, paddingLeft: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  headText: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16 },
  colSet: { width: 28, alignItems: 'flex-start', justifyContent: 'center' },
  colField: { flex: 1, minWidth: 0 },
  colDone: { width: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.xs, paddingLeft: spacing.sm },
  valueCell: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
  bandsCell: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  setLabel: { fontFamily: fonts.monoSemibold, fontSize: 15, lineHeight: 22 },
  activeLabel: { fontFamily: fonts.monoBold },
  foldTap: { minHeight: MIN_TOUCH_TARGET, alignItems: 'flex-start', justifyContent: 'center' },
  warmup: { textDecorationLine: 'underline', textDecorationStyle: 'dashed' },
  figure: { fontFamily: fonts.mono, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16 },
  box: { width: 20, height: 20, borderWidth: 1, borderRadius: radii.small },
  swatch: { width: 12, height: 12, borderRadius: radii.small, borderWidth: 1 },
  active: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.xs + 2, gap: spacing.xs },
  // The rail replaces part of the 8 dp inset, so the set number stays in line with the other rows.
  railed: { borderLeftWidth: spacing.xs, paddingLeft: spacing.sm - spacing.xs },
  railedActive: { borderLeftWidth: spacing.xs },
  numberTag: { minWidth: 24, minHeight: 24, paddingHorizontal: 3, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  numberTagText: { fontFamily: fonts.monoBold, fontSize: 13, lineHeight: 18 },
  statusTag: { fontFamily: fonts.monoSemibold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  boxNext: { borderWidth: 2 },
  // Bands and the Details fold share one line under the fields; they wrap at large text.
  subRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, paddingLeft: spacing.xs + 28 + spacing.xs, paddingRight: spacing.sm },
  bandLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, minHeight: 32 },
  bandText: { fontFamily: fonts.monoSemibold, fontSize: 13 },
  activeMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingLeft: spacing.sm - spacing.xs },
  stack: { gap: spacing.sm, paddingHorizontal: spacing.xs },
  // 36 dp drawn: the − and + inside keep a 48 dp touch area through their hitSlop.
  fieldBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radii.control, minHeight: MIN_TOUCH_TARGET - 12, paddingHorizontal: spacing.xs },
  fieldStacked: { alignSelf: 'stretch' },
  fieldValue: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  completeBtn: { minWidth: 40, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radii.control, flexDirection: 'row', gap: spacing.sm },
  completeStacked: { alignSelf: 'stretch', minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md },
  completeText: { fontFamily: fonts.monoBold, fontSize: 15, lineHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingLeft: spacing.xs + 28 + spacing.xs, alignItems: 'center' },
  chipsFlush: { paddingLeft: spacing.xs },
  chipsFold: {},
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 32, paddingHorizontal: spacing.sm, borderWidth: 1, borderRadius: radii.control, maxWidth: '100%' },
  chipText: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, flexShrink: 1 },
});
