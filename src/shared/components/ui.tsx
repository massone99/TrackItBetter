import * as Haptics from "expo-haptics";
import { router, useSegments } from "expo-router";
import { Children, PropsWithChildren, ReactNode, Ref, createContext, useContext, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, TextInputProps, TextProps, View, ViewProps } from "react-native";
import { KeyboardLift, KeyboardScroll, useKeyboardVisible, type ScrollHandle } from "./keyboard";
import { useAppInsets } from "../layout/useAppInsets";
import { useTranslation } from "react-i18next";
import { useTheme } from "../theme/ThemeProvider";
import { useAnimationSettings } from "../settings/AnimationProvider";
import { fonts } from "../theme/typography";
import { MIN_TOUCH_TARGET, elevation, radii, spacing, typeScale } from "../theme/tokens";
import { Icon, IconName } from "./Icon";
import { Text } from "./Text";
import { useScaledStyles } from "../theme/useScaledStyles";
import { parseNumberInput } from "../utils/format";
import { MAX_FONT_SCALE } from '../theme/scale';

export { Text } from "./Text";
export { Icon } from "./Icon";
export type { IconName } from "./Icon";

export function tapFeedback(kind: "light" | "success" = "light") {
  if (Platform.OS === "web") return;
  if (kind === "success") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/** Lets something inside a screen (a drag in progress) read and move the page's scroll position. */
export interface ScrollControl { getOffset: () => number; scrollTo: (y: number) => void }
const ScrollControlContext = createContext<ScrollControl | null>(null);
export const useScrollControl = () => useContext(ScrollControlContext);

/**
 * Scrolling page. `overlay` is drawn above the scroll view (e.g. a toast), not inside it. `footer`
 * pins the page's main actions to the bottom, so they never need a scroll to the end; it steps
 * aside while the keyboard is open so it never covers the field being typed in.
 */
export function Screen({ children, contentContainerStyle, overlay, footer, footerAccessory, scrollRef }: PropsWithChildren<{
  contentContainerStyle?: ViewProps["style"];
  overlay?: ReactNode;
  footer?: ReactNode;
  /** Live status stacked above the footer actions (e.g. a rest timer), so it never covers them. */
  footerAccessory?: ReactNode;
  scrollRef?: Ref<ScrollHandle>;
}>) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const insets = useAppInsets();
  const keyboardVisible = useKeyboardVisible();
  const showFooter = Boolean(footer || footerAccessory) && !keyboardVisible;
  const inner = useRef<ScrollHandle | null>(null);
  const offset = useRef(0);
  const [control] = useState<ScrollControl>(() => ({
    getOffset: () => offset.current,
    scrollTo: (y) => inner.current?.scrollTo({ y, animated: false }),
  }));
  // The page's own handle (scroll to the next superset exercise) and the drag auto-scroll share one scroll view.
  useImperativeHandle(scrollRef, () => ({ scrollTo: (options) => inner.current?.scrollTo(options) }), []);
  return (
    <View style={[styles.flexFill, { backgroundColor: palette.background }]}>
      <KeyboardScroll
        scrollRef={inner}
        scrollEventThrottle={16}
        onScroll={(event) => { offset.current = event.nativeEvent.contentOffset.y; }}
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={[styles.screen, { paddingTop: Math.max(insets.top, 14) + 10, paddingBottom: footer ? spacing.xl : insets.bottom + 36 }, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
      >
        <ScrollControlContext.Provider value={control}><View style={styles.column}>{children}</View></ScrollControlContext.Provider>
      </KeyboardScroll>
      {showFooter ? (
        <View style={[styles.footer, { backgroundColor: palette.background, borderTopColor: palette.border, paddingBottom: insets.bottom + spacing.md }]}>
          {footerAccessory ? <View style={styles.footerAccessory}>{footerAccessory}</View> : null}
          {footer ? <View style={styles.footerColumn}>{footer}</View> : null}
        </View>
      ) : null}
      {/* The status bar is transparent: this strip keeps scrolled content from showing under its icons. */}
      <View pointerEvents="none" style={[styles.statusScrim, { height: insets.top, backgroundColor: palette.background }]} />
      {overlay}
    </View>
  );
}

/** One action in a `Screen` footer; cells share the row equally. */
export function FooterAction(props: Parameters<typeof ActionButton>[0]) {
  const styles = useScaledStyles(baseStyles);
  return <View style={styles.footerCell}><ActionButton {...props} /></View>;
}

/** Small supporting label in sentence case. */
export function Label({ children, style, ...props }: TextProps) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return <Text {...props} style={[styles.label, { color: palette.textMuted }, style]}>{children}</Text>;
}

export function Title({ children, style, ...props }: TextProps) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return <Text accessibilityRole="header" {...props} style={[styles.title, { color: palette.text }, style]}>{children}</Text>;
}

export function Heading({ children, style, ...props }: TextProps) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return <Text accessibilityRole="header" {...props} style={[styles.heading, { color: palette.text }, style]}>{children}</Text>;
}

export function Body({ children, style, ...props }: TextProps) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return <Text {...props} style={[styles.body, { color: palette.textMuted }, style]}>{children}</Text>;
}

/** Scoreboard numeral: the one loud typographic element of the app. */
export function Numeral({ children, style, ...props }: TextProps) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return <Text {...props} style={[styles.numeral, { color: palette.text }, style]}>{children}</Text>;
}

/** The light theme lifts surfaces with a soft shadow; the dark theme relies on border and tone. */
export function useSurfaceDepth() {
  const { mode } = useTheme();
  return mode === "light" ? elevation.surface : undefined;
}

/**
 * Press feedback for small controls: a quick shrink under the finger. Skipped when the system or the
 * app asks for reduced motion, where only the colour/opacity change remains.
 */
export function usePressScale(amount = 0.94) {
  const { reducedMotion, speed } = useAnimationSettings();
  const calm = reducedMotion || speed === "off";
  return (pressed: boolean) => (calm || !pressed ? undefined : { transform: [{ scale: amount }] });
}

export function Card({ children, style, ...props }: PropsWithChildren<ViewProps>) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const depth = useSurfaceDepth();
  return <View {...props} style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }, depth, style]}>{children}</View>;
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return <View style={styles.sectionTitle}><Text accessibilityRole="header" style={[styles.sectionHeading, { color: palette.text }]}>{title}</Text>{action}</View>;
}

/** A real count or measurement, with its label kept beside the value in the reading order. */
export function Metric({ value, label, detail }: { value: string | number; label: string; detail?: string }) {
  const styles = useScaledStyles(baseStyles);
  return <View style={styles.metric}>
    <Numeral style={styles.metricValue}>{value}</Numeral>
    <Label>{label}</Label>
    {detail ? <Body>{detail}</Body> : null}
  </View>;
}

/** Shared progress feedback; counts and the accessible value always agree with the fill. */
export function ProgressMeter({ value, total, label, tone = "accent" }: { value: number; total: number; label: string; tone?: "accent" | "success" }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const max = Number.isFinite(total) ? Math.max(0, total) : 0;
  const now = Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0;
  return <View
    accessibilityRole="progressbar"
    accessibilityLabel={label}
    accessibilityValue={{ min: 0, max, now }}
    style={[styles.progressTrack, { backgroundColor: palette.surfaceMuted }]}
  >
    <View style={[styles.progressFill, { width: `${max > 0 ? (now / max) * 100 : 0}%`, backgroundColor: tone === "success" ? palette.success : palette.accentStrong }]} />
  </View>;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "inverse";

export function ActionButton({ label, onPress, secondary = false, variant, icon, disabled = false }: {
  label: string;
  onPress?: () => void;
  secondary?: boolean;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const kind: ButtonVariant = variant ?? (secondary ? "secondary" : "primary");
  const pressScale = usePressScale(0.98);
  const background = kind === "primary" ? palette.accent : kind === "secondary" ? palette.surfaceMuted : kind === "inverse" ? palette.heroText : "transparent";
  const color = kind === "primary" ? palette.accentText : kind === "danger" ? palette.warning : kind === "ghost" ? palette.accentStrong : kind === "inverse" ? palette.hero : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => { tapFeedback(); onPress?.(); }}
      style={({ pressed }) => [
        styles.button,
        { minHeight: Math.max(MIN_TOUCH_TARGET, styles.button.minHeight) },
        { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        pressScale(pressed),
        kind === "danger" && { borderWidth: 1, borderColor: palette.border },
      ]}
    >
      {icon ? <Icon name={icon} size={19} color={color} /> : null}
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, tone = "muted", size = 40, color: colorOverride, disabled }: {
  icon: IconName;
  onPress: () => void;
  label: string;
  tone?: "muted" | "accent" | "plain";
  size?: number;
  /** Icon colour for plain buttons drawn on a coloured surface. */
  color?: string;
  disabled?: boolean;
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette, layoutScale: scale } = useTheme();
  const box = Math.max(MIN_TOUCH_TARGET, Math.round(size * scale));
  const background = tone === "accent" ? palette.accent : tone === "muted" ? palette.surfaceMuted : "transparent";
  const color = colorOverride ?? (tone === "accent" ? palette.accentText : palette.text);
  const pressScale = usePressScale(0.92);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={disabled !== undefined ? { disabled } : undefined}
      disabled={disabled}
      hitSlop={6}
      onPress={() => { tapFeedback(); onPress(); }}
      style={({ pressed }) => [styles.iconButton, { width: box, height: box, borderRadius: box / 2.6, backgroundColor: background, opacity: disabled ? 0.3 : pressed ? 0.7 : 1 }, pressScale(pressed)]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={color} />
    </Pressable>
  );
}

/** Page title with an automatic back button on every non-tab screen. */
export function PageHeading({ title, subtitle, action, onTitleLongPress, titleLongPressLabel }: { title: string; subtitle?: string; action?: ReactNode; onTitleLongPress?: () => void; titleLongPressLabel?: string }) {
  const styles = useScaledStyles(baseStyles);
  const segments = useSegments();
  const { t } = useTranslation();
  const showBack = segments[0] !== "(tabs)";
  // Screens opened from a link or notification have no history, so back falls through to Today.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/today"));
  return (
    <View style={styles.pageHeading}>
      {showBack ? (
        <View style={styles.pageTopBar}>
          <IconButton icon="arrow-back" tone="plain" label={t("common.back")} onPress={goBack} />
        </View>
      ) : null}
      <View style={styles.pageTitleRow}>
        {onTitleLongPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityHint={titleLongPressLabel}
            onLongPress={onTitleLongPress}
            accessibilityActions={[{ name: "longpress", label: titleLongPressLabel }]}
            onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === "longpress") onTitleLongPress(); }}
            style={styles.pageTitlePress}
          >
            <Title style={styles.pageTitle}>{title}</Title>
          </Pressable>
        ) : <Title style={styles.pageTitle}>{title}</Title>}
        {action}
      </View>
      {subtitle ? <Body style={styles.pageSubtitle}>{subtitle}</Body> : null}
    </View>
  );
}

export function ListRow({ icon, title, subtitle, onPress, onLongPress, longPressLabel, trailing, tint, selected }: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Screen-reader name of the long-press action. */
  longPressLabel?: string;
  trailing?: ReactNode;
  tint?: string;
  /** For a list of choices: true marks the current one with a check; false leaves room for it. Leave undefined for a normal row. */
  selected?: boolean;
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const content = (
    <>
      {icon ? (
        <View style={[styles.listIcon, { backgroundColor: tint ? `${tint}22` : palette.accentSoft }]}>
          <Icon name={icon} size={18} color={tint ?? palette.accentStrong} />
        </View>
      ) : null}
      <View style={styles.listCopy}>
        <Text style={[styles.listTitle, { color: selected ? palette.accentStrong : palette.text }, selected ? styles.listTitleSelected : null]}>{title}</Text>
        {subtitle ? <Text style={[styles.listSubtitle, { color: palette.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {selected !== undefined ? (
        <View style={styles.listCheck}>{selected ? <Icon name="checkmark-circle" size={22} color={palette.accentStrong} /> : null}</View>
      ) : !trailing && onPress ? <Icon name="chevron-forward" size={18} color={palette.textMuted} /> : null}
    </>
  );
  // A custom trailing control (e.g. a favourite toggle) sits beside the pressable area, never inside it.
  return (
    <View style={styles.listRowOuter}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
          accessibilityState={selected !== undefined ? { selected } : undefined}
          onPress={() => { tapFeedback(); onPress(); }}
          onLongPress={onLongPress}
          accessibilityActions={onLongPress ? [{ name: "longpress", label: longPressLabel }] : undefined}
          onAccessibilityAction={onLongPress ? (event) => { if (event.nativeEvent.actionName === "longpress") onLongPress(); } : undefined}
          style={({ pressed }) => [styles.listRow, { backgroundColor: pressed ? palette.surfaceMuted : "transparent" }]}
        >
          {content}
        </Pressable>
      ) : <View style={styles.listRow}>{content}</View>}
      {trailing ? <View style={styles.listTrailing}>{trailing}</View> : null}
    </View>
  );
}

/** Compact − value + control for small bounded numbers. */
/**
 * Press handlers for a +/- button: a tap acts once, holding repeats the action and speeds up,
 * so a long range (a 3-minute rest, a 45 s hold) needs one press instead of dozens of taps.
 */
export function useRepeatPress(action: (multiplier: number) => void) {
  const latest = useRef(action);
  useEffect(() => { latest.current = action; });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stop, []);
  return {
    onPress: () => { tapFeedback(); latest.current(1); },
    onLongPress: () => {
      stop();
      let ticks = 0;
      timer.current = setInterval(() => { ticks += 1; latest.current(ticks > 8 ? 5 : 1); }, 110);
    },
    onPressOut: stop,
    delayLongPress: 350,
  };
}

function StepperButton({ icon, label, disabled, onStep }: { icon: IconName; label: string; disabled: boolean; onStep: (multiplier: number) => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const handlers = useRepeatPress(onStep);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} hitSlop={4} disabled={disabled} {...handlers} style={[styles.stepperButton, { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, backgroundColor: palette.surfaceMuted, opacity: disabled ? 0.4 : 1 }]}>
      <Icon name={icon} size={18} color={palette.text} />
    </Pressable>
  );
}

/**
 * Value with - and + buttons (hold to repeat). With `editable` the value is tappable and typed
 * ("1:30" works when `clock`); `presets` adds one-tap chips for the usual values.
 */
export function Stepper({ label, value, display, step = 1, min = 0, max = 999, layout = "column", editable = false, clock = false, presets, presetLabel, onChange }: {
  label: string;
  /** "row" puts the label on the left and the controls on the right, for stacked settings. */
  layout?: "column" | "row";
  value: number;
  display?: string;
  step?: number;
  min?: number;
  max?: number;
  editable?: boolean;
  /** Typed values are read as m:ss too. */
  clock?: boolean;
  /** Quick values shown as chips under the row. */
  presets?: number[];
  presetLabel?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next * 100) / 100));
  const editor = useRef<NumberEditControl | null>(null);
  // While the number is being typed, buttons step what is typed, and the field shows the result.
  const change = (delta: number) => {
    const typed = editable ? editor.current?.read() ?? null : null;
    const next = clamp((typed ?? value) + delta);
    if (typed !== null && !clock) editor.current?.set(String(next));
    else if (typed !== null) editor.current?.set(null);
    onChange(next);
  };
  const shown = display ?? String(value);
  return (
    <View>
      <View style={layout === "row" ? styles.stepperRow : styles.stepper}>
        <Text style={[layout === "row" ? styles.stepperRowLabel : styles.stepperLabel, { color: layout === "row" ? palette.text : palette.textMuted }]}>{label}</Text>
        <View style={styles.stepperControls}>
          <StepperButton icon="remove" label={`${label} −`} disabled={value <= min} onStep={(multiplier) => change(-step * multiplier)} />
          {editable ? (
            <NumberEdit value={value} display={shown} initialDraft={value < 0 ? "" : undefined} clock={clock} label={label} onControl={(control) => { editor.current = control; }} onCommit={(next) => onChange(clamp(next))} style={styles.stepperValue} />
          ) : (
            <Text style={styles.stepperValue}>{shown}</Text>
          )}
          <StepperButton icon="add" label={`${label} +`} disabled={value >= max} onStep={(multiplier) => change(step * multiplier)} />
        </View>
      </View>
      {presets && presets.length > 0 ? (
        <View style={styles.presetRow}>
          {presets.map((preset) => (
            <Chip key={preset} label={presetLabel ? presetLabel(preset) : String(preset)} selected={value === preset} onPress={() => onChange(clamp(preset))} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** List row with an on/off switch. */
export function SwitchRow({ icon, title, subtitle, value, onChange }: { icon?: IconName; title: string; subtitle?: string; value: boolean; onChange: (value: boolean) => void }) {
  const { palette } = useTheme();
  return (
    <ListRow
      icon={icon}
      title={title}
      subtitle={subtitle}
      trailing={
        <Switch
          accessibilityLabel={title}
          value={value}
          onValueChange={(next) => { tapFeedback(); onChange(next); }}
          trackColor={{ false: palette.surfaceMuted, true: palette.accent }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={palette.surfaceMuted}
        />
      }
    />
  );
}

/** List row that toggles a checkbox; the whole row is the touch target. */
export function CheckRow({ icon, title, subtitle, checked, onChange, tint }: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tint?: string;
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const accent = tint ?? palette.accent;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={() => { tapFeedback(); onChange(!checked); }}
      style={({ pressed }) => [styles.listRow, { backgroundColor: pressed ? palette.surfaceMuted : "transparent" }]}
    >
      {icon ? (
        <View style={[styles.listIcon, { backgroundColor: tint ? `${tint}22` : palette.accentSoft }]}>
          <Icon name={icon} size={18} color={tint ?? palette.accentStrong} />
        </View>
      ) : null}
      <View style={styles.listCopy}>
        <Text style={[styles.listTitle, { color: palette.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.listSubtitle, { color: palette.textMuted }]}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.checkbox, { backgroundColor: checked ? accent : "transparent", borderColor: checked ? accent : palette.border }]}>
        {checked ? <Icon name="checkmark" size={16} color={palette.accentText} /> : null}
      </View>
    </Pressable>
  );
}

/** Groups rows into one surface separated by hairlines. */
export function ListGroup({ children }: PropsWithChildren) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const depth = useSurfaceDepth();
  // toArray flattens nested arrays (a mapped list beside fixed rows) and drops false/null.
  const items = Children.toArray(children);
  return (
    <View style={[styles.listGroup, { backgroundColor: palette.surface, borderColor: palette.border }, depth]}>
      {items.map((child, index) => (
        <View key={index} style={index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border } : undefined}>{child}</View>
      ))}
    </View>
  );
}

export function Chip({ label, selected = false, onPress, icon, accessibilityLabel }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; accessibilityLabel?: string }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const color = selected ? palette.accentStrong : palette.textMuted;
  const pressScale = usePressScale(0.95);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      hitSlop={4}
      onPress={() => { tapFeedback(); onPress?.(); }}
      style={({ pressed }) => [styles.chip, { minHeight: MIN_TOUCH_TARGET, backgroundColor: selected ? palette.accentSoft : palette.surface, borderColor: selected ? palette.accentStrong : palette.border, opacity: pressed ? 0.75 : 1 }, pressScale(pressed)]}
    >
      {icon ? <Icon name={icon} size={14} color={color} /> : null}
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const depth = useSurfaceDepth();
  return (
    <View style={[styles.empty, { backgroundColor: palette.surface, borderColor: palette.border }, depth]}>
      <View style={[styles.emptyIcon, { backgroundColor: palette.accentSoft }]}><Icon name={icon} size={24} color={palette.accentStrong} /></View>
      <Heading style={styles.center}>{title}</Heading>
      <Body style={styles.center}>{body}</Body>
      {action}
    </View>
  );
}

export function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: palette.surfaceMuted }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => { tapFeedback(); onChange(option.value); }}
            style={({ pressed }) => [styles.segmentOption, { minHeight: MIN_TOUCH_TARGET, opacity: pressed ? 0.75 : 1 }, selected && { backgroundColor: palette.surface }]}
          >
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.segmentText, { color: selected ? palette.accentStrong : palette.textMuted }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bottom sheet for confirmations and short choices; works the same on web and native. */
export function Sheet({ visible, onClose, title, body, children }: PropsWithChildren<{ visible: boolean; onClose: () => void; title: string; body?: string }>) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const insets = useAppInsets();
  const { speed, reducedMotion } = useAnimationSettings();
  return (
    // Translucent bars give the keyboard controller correct coordinates inside an edge-to-edge Modal.
    <Modal visible={visible} transparent animationType={reducedMotion || speed === "off" ? "none" : speed === "fast" ? "fade" : "slide"} onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardLift style={styles.flexFill}>
        <View style={[styles.sheetBackdrop, { paddingTop: insets.top + 12 }]}>
          {/* A sibling of the sheet, not its parent: content inside a button breaks screen readers and web. */}
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={[styles.sheet, { backgroundColor: palette.surface, paddingBottom: insets.bottom + 20, maxHeight: "100%" }]}>
            <View style={[styles.sheetHandle, { backgroundColor: palette.border }]} />
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
              <View style={styles.sheetHeading}>
                <Heading style={styles.sheetTitle}>{title}</Heading>
                <IconButton icon="close" label={t("common.close")} tone="plain" onPress={onClose} />
              </View>
              {body ? <Body>{body}</Body> : null}
              <View style={styles.sheetActions}>{children}</View>
            </ScrollView>
          </View>
        </View>
      </KeyboardLift>
    </Modal>
  );
}

/** Pause in typing after which a field saves on its own. */
export const AUTOSAVE_DELAY_MS = 400;

/**
 * A number shown as text that turns into a numeric field when tapped, so a value can be typed
 * instead of stepped. With `clock`, "1:30" is accepted as 90 seconds. Invalid input is discarded.
 */
/** Lets buttons next to a `NumberEdit` step the number being typed instead of the saved one. */
export type NumberEditControl = {
  /** The typed number while the field is open; null when closed or not a number yet. */
  read: () => number | null;
  /** Replaces the typed text (field stays open); with no text, closes the field. */
  set: (text: string | null) => void;
};

export function NumberEdit({ value, display, label, onCommit, onLongPress, initialDraft, clock = false, allowNegative = false, disabled = false, style, onControl }: {
  value: number;
  /** Text shown while not editing, e.g. "1:05". */
  display: string;
  /** Accessible name, e.g. "Reps, set 2". */
  label: string;
  onCommit: (value: number) => void;
  /** Held press on the value, so a parent row can offer its own menu from here too. */
  onLongPress?: () => void;
  /** What the field starts with when tapped, when that differs from the value (e.g. a placeholder value). */
  initialDraft?: string;
  clock?: boolean;
  allowNegative?: boolean;
  disabled?: boolean;
  style?: TextProps["style"];
  /** Called after every render with the controls, for buttons that step the typed number. */
  onControl?: (control: NumberEditControl) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  // Typing saves after a short pause rather than on every keystroke (each save reloads the workout);
  // leaving the field, or the screen, saves at once.
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; value: number } | null>(null);
  const saved = useRef<number | null>(null);
  const commitValue = (next: number) => {
    if (next === value || next === saved.current) return;
    saved.current = next;
    onCommit(next);
  };
  const flush = () => {
    const waiting = pending.current;
    if (!waiting) return;
    clearTimeout(waiting.timer);
    pending.current = null;
    commitValue(waiting.value);
  };
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; });
  useEffect(() => () => flushRef.current(), []);
  useEffect(() => {
    draftRef.current = draft;
    onControl?.({
      read: () => (draftRef.current === null ? null : parseNumberInput(draftRef.current, clock)),
      set: (text) => {
        if (pending.current) { clearTimeout(pending.current.timer); pending.current = null; }
        saved.current = null;
        draftRef.current = text;
        setDraft(text);
      },
    });
  });
  const commit = () => {
    if (draft === null) return;
    const parsed = parseNumberInput(draft, clock);
    if (pending.current) { clearTimeout(pending.current.timer); pending.current = null; }
    setDraft(null);
    saved.current = null;
    if (parsed === null || (!allowNegative && parsed < 0)) return;
    if (parsed !== value) onCommit(parsed);
  };
  if (draft !== null) {
    return (
      <TextInput maxFontSizeMultiplier={MAX_FONT_SCALE}
        accessibilityLabel={label}
        autoFocus
        selectTextOnFocus
        keyboardType={clock ? "numbers-and-punctuation" : allowNegative ? "numbers-and-punctuation" : "decimal-pad"}
        value={draft}
        // Saved shortly after typing stops, so a value counts even if the field is never confirmed.
        onChangeText={(text) => {
          setDraft(text);
          const parsed = parseNumberInput(text, clock);
          if (pending.current) clearTimeout(pending.current.timer);
          pending.current = parsed !== null && (allowNegative || parsed >= 0)
            ? { value: parsed, timer: setTimeout(flush, AUTOSAVE_DELAY_MS) }
            : null;
        }}
        onBlur={commit}
        onSubmitEditing={commit}
        returnKeyType="done"
        style={[styles.numberInput, { color: palette.text, backgroundColor: palette.surfaceMuted, borderColor: palette.accentStrong }, style]}
      />
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={disabled ? undefined : display}
      disabled={disabled}
      hitSlop={6}
      onPress={() => { tapFeedback(); setDraft(initialDraft ?? (clock ? display : String(value))); }}
      onLongPress={onLongPress}
      delayLongPress={450}
    >
      <Text style={style}>{display}</Text>
    </Pressable>
  );
}

/**
 * Short message at the bottom of the screen with an optional action (e.g. "Restore"). It stays clear
 * of the navigation bar and of any bar the screen shows above it (`bottomOffset`), and hides itself
 * after a few seconds.
 */
export function Toast({ message, actionLabel, onAction, onHide, bottomOffset = 0 }: {
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  onHide: () => void;
  bottomOffset?: number;
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const insets = useAppInsets();
  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(onHide, 8000);
    return () => clearTimeout(timer);
  }, [message, onHide]);
  if (message === null) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.toast, { bottom: insets.bottom + 16 + bottomOffset, backgroundColor: palette.text }]}
    >
      <Text style={[styles.toastText, { color: palette.background }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={() => { tapFeedback(); onAction(); onHide(); }} style={styles.toastAction}>
          <Text style={[styles.toastActionText, { color: palette.accentSoft }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Labelled text input with an optional hint and error message. */
export function TextField({ label, hint, error, style, multiline, onFocus, onBlur, ...props }: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
  const styles = useScaledStyles(baseStyles);
  const { palette, layoutScale: scale } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      {label ? <Label>{label}</Label> : null}
      <TextInput maxFontSizeMultiplier={MAX_FONT_SCALE}
        accessibilityLabel={label ?? props.placeholder}
        placeholderTextColor={palette.textMuted}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        {...props}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          { minHeight: Math.max(MIN_TOUCH_TARGET, multiline ? styles.inputMultiline.minHeight : styles.input.minHeight), backgroundColor: palette.surface, borderColor: error ? palette.warning : focused ? palette.accentStrong : palette.border, color: palette.text, fontSize: 16 * scale },
          style,
        ]}
      />
      {error ? <Text style={[styles.fieldNote, { color: palette.warning }]}>{error}</Text> : hint ? <Text style={[styles.fieldNote, { color: palette.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  flexFill: { flex: 1 },
  toast: { position: "absolute", left: 16, right: 16, minHeight: 52, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12, elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  toastText: { flex: 1, fontFamily: fonts.medium, fontSize: 15 },
  toastAction: { paddingHorizontal: 6, paddingVertical: 6 },
  toastActionText: { fontFamily: fonts.semibold, fontSize: 15 },
  numberInput: { minWidth: 64, minHeight: 40, borderRadius: 10, borderWidth: 2, textAlign: "center", fontFamily: fonts.display, fontSize: 22, paddingHorizontal: 6, paddingVertical: 0 },
  statusScrim: { position: "absolute", top: 0, left: 0, right: 0 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, paddingHorizontal: spacing.page, alignItems: "center" },
  footerColumn: { width: "100%", maxWidth: 640, flexDirection: "row", gap: spacing.md },
  footerCell: { flex: 1 },
  footerAccessory: { width: "100%", maxWidth: 640, marginBottom: spacing.md },
  stepper: { gap: 4, alignItems: "center" },
  stepperLabel: { fontFamily: fonts.medium, fontSize: 12 },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 40 },
  stepperRowLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 15 },
  stepperControls: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepperButton: { width: 44, height: 44, borderRadius: radii.control, alignItems: "center", justifyContent: "center" },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 6, paddingBottom: 4 },
  stepperValue: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, minWidth: 52, textAlign: "center", fontVariant: ["tabular-nums"] },
  field: { gap: 6 },
  input: { minHeight: 52, borderRadius: radii.control, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 12, fontFamily: fonts.body, fontSize: 16, outlineWidth: 0 },
  inputMultiline: { minHeight: 84, paddingTop: 12, paddingBottom: 12 },
  fieldNote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(10, 18, 26, 0.6)" },
  sheet: { borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, paddingHorizontal: spacing.page, paddingTop: 12, gap: 10, width: "100%", maxWidth: 640, alignSelf: "center" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 8 },
  sheetHeading: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sheetTitle: { flex: 1, fontFamily: fonts.display, fontSize: 28, lineHeight: 32 },
  sheetContent: { gap: 10 },
  sheetActions: { gap: 10, marginTop: 8 },
  screen: { paddingHorizontal: spacing.page, alignItems: "center" },
  column: { width: "100%", maxWidth: 640, gap: spacing.xl },
  pageHeading: { gap: spacing.sm },
  pageTopBar: { flexDirection: "row", alignItems: "center", marginLeft: -12, marginTop: -8 },
  pageTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pageTitle: { flex: 1 },
  pageTitlePress: { flex: 1 },
  pageSubtitle: { fontSize: 15, lineHeight: 22 },
  title: { fontFamily: fonts.display, ...typeScale.title },
  heading: { fontFamily: fonts.semibold, ...typeScale.heading },
  label: { fontFamily: fonts.medium, ...typeScale.label },
  body: { fontFamily: fonts.body, ...typeScale.body },
  numeral: { fontFamily: fonts.display, ...typeScale.metric, fontVariant: ["tabular-nums"] },
  metric: { flex: 1, gap: spacing.xs },
  metricValue: { fontSize: 32, lineHeight: 36 },
  progressTrack: { height: 8, borderRadius: radii.pill, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: radii.pill },
  card: { borderWidth: 1, borderRadius: radii.surface, padding: spacing.lg, gap: spacing.md },
  sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  sectionHeading: { flex: 1, fontFamily: fonts.displayMedium, ...typeScale.section },
  button: { minHeight: 54, borderRadius: radii.control, paddingHorizontal: 18, paddingVertical: 13, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9 },
  buttonText: { flexShrink: 1, textAlign: "center", fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  iconButton: { alignItems: "center", justifyContent: "center" },
  listGroup: { borderRadius: radii.surface, borderWidth: 1, overflow: "hidden" },
  listRowOuter: { flexDirection: "row", alignItems: "center" },
  listRow: { flex: 1, minHeight: 68, paddingHorizontal: spacing.lg, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: spacing.md },
  listTrailing: { flexShrink: 0, paddingRight: 10, paddingLeft: 4 },
  listIcon: { width: 36, height: 36, borderRadius: radii.control, alignItems: "center", justifyContent: "center" },
  listCopy: { flex: 1, minWidth: 0, gap: 3 },
  checkbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  listTitle: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  listTitleSelected: { fontFamily: fonts.semibold },
  listCheck: { width: 22, alignItems: "center" },
  listSubtitle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  chip: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.control, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  chipText: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  empty: { borderWidth: 1, borderRadius: radii.surface, padding: spacing.section, alignItems: "center", gap: spacing.md },
  emptyIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  center: { textAlign: "center" },
  segment: { flexDirection: "row", borderRadius: radii.surface, padding: 4, gap: 4 },
  segmentOption: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 6, paddingVertical: 10, alignItems: "center", justifyContent: "center", borderRadius: radii.control },
  segmentText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, textAlign: "center" },
});
