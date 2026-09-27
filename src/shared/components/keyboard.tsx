import type { PropsWithChildren } from "react";
import type { ScrollViewProps, ViewProps } from "react-native";
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  KeyboardProvider,
  useKeyboardState,
} from "react-native-keyboard-controller";

/*
 * Keyboard handling for native. Android runs edge-to-edge, where adjustResize does nothing, so every
 * screen and sheet goes through react-native-keyboard-controller instead of React Native's own helpers.
 * The web build uses keyboard.web.tsx.
 */

export function KeyboardRoot({ children }: PropsWithChildren) {
  return <KeyboardProvider>{children}</KeyboardProvider>;
}

/** Scroll view that keeps the focused input above the keyboard. */
export function KeyboardScroll(props: ScrollViewProps) {
  return <KeyboardAwareScrollView bottomOffset={28} keyboardShouldPersistTaps="handled" {...props} />;
}

/** Lifts its content (e.g. a bottom sheet) by the keyboard height. */
export function KeyboardLift({ children, style }: PropsWithChildren<{ style?: ViewProps["style"] }>) {
  return <KeyboardAvoidingView behavior="padding" style={style}>{children}</KeyboardAvoidingView>;
}

export function useKeyboardVisible(): boolean {
  return useKeyboardState((state) => state.isVisible);
}
