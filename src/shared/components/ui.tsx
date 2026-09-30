import * as Haptics from "expo-haptics";
import { router, useSegments } from "expo-router";
import { Children, PropsWithChildren, ReactNode, Ref, useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, TextInputProps, TextProps, View, ViewProps } from "react-native";
import { KeyboardLift, KeyboardScroll, type ScrollHandle } from "./keyboard";
import { useAppInsets } from "../layout/useAppInsets";
import { useTranslation } from "react-i18next";
import { useTheme } from "../theme/ThemeProvider";
import { useAnimationSettings } from "../settings/AnimationProvider";
import { fonts } from "../theme/typography";
import { Icon, IconName } from "./Icon";
import { Text } from "./Text";
import { useScaledStyles } from "../theme/useScaledStyles";
import { parseNumberInput } from "../utils/format";

export { Text } from "./Text";
export { Icon } from "./Icon";
export type { IconName } from "./Icon";

export function tapFeedback(kind: "light" | "success" = "light") {
  if (Platform.OS === "web") return;
  if (kind === "success") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/** Scrolling page. `overlay` is drawn above the scroll view (e.g. a toast), not inside it. */
export function Screen({ children, contentContainerStyle, overlay, scrollRef }: PropsWithChildren<{ contentContainerStyle?: ViewProps["style"]; overlay?: ReactNode; scrollRef?: Ref<ScrollHandle> }>) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const insets = useAppInsets();
  return (
    <View style={[styles.flexFill, { backgroundColor: palette.background }]}>
      <KeyboardScroll
        scrollRef={scrollRef}
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={[styles.screen, { paddingTop: Math.max(insets.top, 14) + 10, paddingBottom: insets.bottom + 36 }, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>{children}</View>
      </KeyboardScroll>
      {/* The status bar is transparent: this strip keeps scrolled content from showing under its icons. */}
      <View pointerEvents="none" style={[styles.statusScrim, { height: insets.top, backgroundColor: palette.background }]} />
      {overlay}
    </View>
  );
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
  return <Text {...props} style={[styles.title, { color: palette.text }, style]}>{children}</Text>;
}

export function Heading({ children, style, ...props }: TextProps) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return <Text {...props} style={[styles.heading, { color: palette.text }, style]}>{children}</Text>;
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

export function Card({ children, style, ...props }: PropsWithChildren<ViewProps>) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return <View {...props} style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }, style]}>{children}</View>;
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return <View style={styles.sectionTitle}><Text style={[styles.sectionHeading, { color: palette.text }]}>{title}</Text>{action}</View>;
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
        { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] },
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
  const { palette, scale } = useTheme();
  const box = Math.round(size * scale);
  const background = tone === "accent" ? palette.accent : tone === "muted" ? palette.surfaceMuted : "transparent";
  const color = colorOverride ?? (tone === "accent" ? palette.accentText : palette.text);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={disabled !== undefined ? { disabled } : undefined}
      disabled={disabled}
      hitSlop={6}
      onPress={() => { tapFeedback(); onPress(); }}
      style={({ pressed }) => [styles.iconButton, { width: box, height: box, borderRadius: box / 2.6, backgroundColor: background, opacity: disabled ? 0.3 : pressed ? 0.7 : 1 }]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={color} />
    </Pressable>
  );
}

/** Page title with an automatic back button on every non-tab screen. */
export function PageHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const styles = useScaledStyles(baseStyles);
  const segments = useSegments();
  const { t } = useTranslation();
  const showBack = segments[0] !== "(tabs)";
  // Screens opened from a link or notification have no history, so back falls through to Today.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/today"));
  return (
    <View style={styles.pageHeading}>
      {showBack || action ? (
        <View style={styles.pageTopBar}>
          {showBack ? <IconButton icon="chevron-back" label={t("common.back")} onPress={goBack} /> : <View />}
          {action}
        </View>
      ) : null}
      <Title>{title}</Title>
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
        {subtitle ? <Text style={[styles.listSubtitle, { color: palette.textMuted }]} numberOfLines={2}>{subtitle}</Text> : null}
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
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} disabled={disabled} {...handlers} style={[styles.stepperButton, { backgroundColor: palette.surfaceMuted, opacity: disabled ? 0.4 : 1 }]}>
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
  const change = (delta: number) => onChange(clamp(value + delta));
  const shown = display ?? String(value);
  return (
    <View>
      <View style={layout === "row" ? styles.stepperRow : styles.stepper}>
        <Text style={[layout === "row" ? styles.stepperRowLabel : styles.stepperLabel, { color: layout === "row" ? palette.text : palette.textMuted }]}>{label}</Text>
        <View style={styles.stepperControls}>
          <StepperButton icon="remove" label={`${label} −`} disabled={value <= min} onStep={(multiplier) => change(-step * multiplier)} />
          {editable ? (
            <NumberEdit value={value} display={shown} initialDraft={value < 0 ? "" : undefined} clock={clock} label={label} onCommit={(next) => onChange(clamp(next))} style={styles.stepperValue} />
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
        {subtitle ? <Text style={[styles.listSubtitle, { color: palette.textMuted }]} numberOfLines={3}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.checkbox, { backgroundColor: checked ? accent : "transparent", borderColor: checked ? accent : palette.border }]}>
        {checked ? <Icon name="checkmark" size={16} color="#FFFFFF" /> : null}
      </View>
    </Pressable>
  );
}

/** Groups rows into one surface separated by hairlines. */
export function ListGroup({ children }: PropsWithChildren) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  // toArray flattens nested arrays (a mapped list beside fixed rows) and drops false/null.
  const items = Children.toArray(children);
  return (
    <View style={[styles.listGroup, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      {items.map((child, index) => (
        <View key={index} style={index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border } : undefined}>{child}</View>
      ))}
    </View>
  );
}

export function Chip({ label, selected = false, onPress, icon, accessibilityLabel }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; accessibilityLabel?: string }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const color = selected ? palette.accentText : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      hitSlop={4}
      onPress={() => { tapFeedback(); onPress?.(); }}
      style={[styles.chip, { backgroundColor: selected ? palette.accent : palette.surface, borderColor: selected ? palette.accent : palette.border }]}
    >
      {icon ? <Icon name={icon} size={14} color={color} /> : null}
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <View style={[styles.empty, { borderColor: palette.border }]}>
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
            style={[styles.segmentOption, selected && { backgroundColor: palette.surface, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 }]}
          >
            <Text style={[styles.segmentText, { color: selected ? palette.text : palette.textMuted }]}>{option.label}</Text>
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
              <Heading style={styles.sheetTitle}>{title}</Heading>
              {body ? <Body>{body}</Body> : null}
              <View style={styles.sheetActions}>{children}</View>
            </ScrollView>
          </View>
        </View>
      </KeyboardLift>
    </Modal>
  );
}

/**
 * A number shown as text that turns into a numeric field when tapped, so a value can be typed
 * instead of stepped. With `clock`, "1:30" is accepted as 90 seconds. Invalid input is discarded.
 */
export function NumberEdit({ value, display, label, onCommit, initialDraft, clock = false, allowNegative = false, disabled = false, style }: {
  value: number;
  /** Text shown while not editing, e.g. "1:05". */
  display: string;
  /** Accessible name, e.g. "Reps, set 2". */
  label: string;
  onCommit: (value: number) => void;
  /** What the field starts with when tapped, when that differs from the value (e.g. a placeholder value). */
  initialDraft?: string;
  clock?: boolean;
  allowNegative?: boolean;
  disabled?: boolean;
  style?: TextProps["style"];
}) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const parsed = parseNumberInput(draft, clock);
    setDraft(null);
    if (parsed === null || (!allowNegative && parsed < 0) || parsed === value) return;
    onCommit(parsed);
  };
  if (draft !== null) {
    return (
      <TextInput
        accessibilityLabel={label}
        autoFocus
        selectTextOnFocus
        keyboardType={clock ? "numbers-and-punctuation" : allowNegative ? "numbers-and-punctuation" : "decimal-pad"}
        value={draft}
        onChangeText={setDraft}
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
  const { palette, scale } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
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
          { backgroundColor: palette.surfaceMuted, borderColor: error ? palette.warning : focused ? palette.accentStrong : "transparent", color: palette.text, fontSize: 16 * scale },
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
  numberInput: { minWidth: 64, height: 40, borderRadius: 10, borderWidth: 2, textAlign: "center", fontFamily: fonts.display, fontSize: 22, paddingHorizontal: 6, paddingVertical: 0 },
  statusScrim: { position: "absolute", top: 0, left: 0, right: 0 },
  stepper: { gap: 4, alignItems: "center" },
  stepperLabel: { fontFamily: fonts.medium, fontSize: 12 },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 40 },
  stepperRowLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 15 },
  stepperControls: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepperButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 6, paddingBottom: 4 },
  stepperValue: { fontFamily: fonts.display, fontSize: 20, minWidth: 52, textAlign: "center", fontVariant: ["tabular-nums"] },
  field: { gap: 6 },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 16, outlineWidth: 0 },
  inputMultiline: { minHeight: 84, paddingTop: 12, paddingBottom: 12 },
  fieldNote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(10, 14, 22, 0.45)" },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 10, gap: 10, width: "100%", maxWidth: 640, alignSelf: "center" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 8 },
  sheetTitle: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30 },
  sheetContent: { gap: 10 },
  sheetActions: { gap: 10, marginTop: 8 },
  screen: { paddingHorizontal: 20, alignItems: "center" },
  column: { width: "100%", maxWidth: 640, gap: 20 },
  pageHeading: { gap: 6 },
  pageTopBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  pageSubtitle: { fontSize: 15, lineHeight: 22 },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23 },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  numeral: { fontFamily: fonts.display, fontSize: 44, lineHeight: 46, fontVariant: ["tabular-nums"] },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 18, gap: 12 },
  sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  sectionHeading: { fontFamily: fonts.displayMedium, fontSize: 22, letterSpacing: 0.1 },
  button: { minHeight: 52, borderRadius: 14, paddingHorizontal: 18, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 16 },
  iconButton: { alignItems: "center", justifyContent: "center" },
  listGroup: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  listRowOuter: { flexDirection: "row", alignItems: "center" },
  listRow: { flex: 1, minHeight: 60, paddingHorizontal: 16, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 13 },
  listTrailing: { paddingRight: 14, paddingLeft: 4 },
  listIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  listCopy: { flex: 1, gap: 2 },
  checkbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  listTitle: { fontFamily: fonts.medium, fontSize: 16 },
  listTitleSelected: { fontFamily: fonts.semibold },
  listCheck: { width: 22, alignItems: "center" },
  listSubtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  chipText: { fontFamily: fonts.medium, fontSize: 14 },
  empty: { borderWidth: 1, borderStyle: "dashed", borderRadius: 20, padding: 24, alignItems: "center", gap: 10 },
  emptyIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  center: { textAlign: "center" },
  segment: { flexDirection: "row", borderRadius: 12, padding: 3, gap: 3 },
  segmentOption: { flex: 1, minHeight: 40, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  segmentText: { fontFamily: fonts.semibold, fontSize: 14 },
});
