import type { PropsWithChildren } from "react";
import { ScrollView, View, type ScrollViewProps, type ViewProps } from "react-native";

// Browsers resize the viewport for the virtual keyboard themselves; these are plain equivalents.

export function KeyboardRoot({ children }: PropsWithChildren) {
  return <>{children}</>;
}

export function KeyboardScroll(props: ScrollViewProps) {
  return <ScrollView keyboardShouldPersistTaps="handled" {...props} />;
}

export function KeyboardLift({ children, style }: PropsWithChildren<{ style?: ViewProps["style"] }>) {
  return <View style={style}>{children}</View>;
}

export function useKeyboardVisible(): boolean {
  return false;
}
