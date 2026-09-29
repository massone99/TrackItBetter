import type { PropsWithChildren, Ref } from "react";
import { ScrollView, View, type ScrollViewProps, type ViewProps } from "react-native";

// Browsers resize the viewport for the virtual keyboard themselves; these are plain equivalents.

export function KeyboardRoot({ children }: PropsWithChildren) {
  return <>{children}</>;
}

/** What a screen needs to scroll programmatically, e.g. to the next exercise of a superset. */
export type ScrollHandle = { scrollTo: (options: { y: number; animated?: boolean }) => void };

export function KeyboardScroll({ scrollRef, ...props }: ScrollViewProps & { scrollRef?: Ref<ScrollHandle> }) {
  return <ScrollView ref={scrollRef as never} keyboardShouldPersistTaps="handled" {...props} />;
}

export function KeyboardLift({ children, style }: PropsWithChildren<{ style?: ViewProps["style"] }>) {
  return <View style={style}>{children}</View>;
}

export function useKeyboardVisible(): boolean {
  return false;
}
