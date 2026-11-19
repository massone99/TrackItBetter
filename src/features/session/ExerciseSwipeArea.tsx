import { useMemo, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

export function ExerciseSwipeArea({ previousId, nextId, onNavigate, children }: PropsWithChildren<{
  previousId?: string;
  nextId?: string;
  onNavigate: (entryId: string) => void;
}>) {
  const start = useSharedValue({ x: 0, y: 0 });
  const swipe = useMemo(() => Gesture.Pan()
    .enabled(Boolean(previousId || nextId))
    .maxPointers(1)
    .manualActivation(true)
    .onTouchesDown(({ allTouches }, state) => {
      const touch = allTouches[0];
      if (allTouches.length !== 1 || !touch) { state.fail(); return; }
      start.set({ x: touch.absoluteX, y: touch.absoluteY });
    })
    .onTouchesMove(({ allTouches }, state) => {
      const touch = allTouches[0];
      if (!touch) return;
      const origin = start.get();
      const x = Math.abs(touch.absoluteX - origin.x);
      const y = Math.abs(touch.absoluteY - origin.y);
      // Resolve direction before activation so a vertical scroll can take over.
      if (x >= 14 && x > y * 1.2) state.activate();
      else if (y >= 24 && y > x * 1.2 && x < 14) state.fail();
    })
    .onEnd(({ absoluteX, absoluteY }, recognized) => {
      const origin = start.get();
      const x = absoluteX - origin.x;
      const y = absoluteY - origin.y;
      if (!recognized || Math.abs(x) < 48 || Math.abs(x) <= Math.abs(y)) return;
      const entryId = x < 0 ? nextId : previousId;
      if (entryId) runOnJS(onNavigate)(entryId);
    }), [nextId, onNavigate, previousId, start]);

  return (
    <GestureDetector gesture={swipe} touchAction="pan-y" userSelect="none">
      <View collapsable={false}>{children}</View>
    </GestureDetector>
  );
}
