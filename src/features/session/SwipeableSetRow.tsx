import { PropsWithChildren, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { SwipeDirection, type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Icon, Text, tapFeedback, type IconName } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

/** How far a row must travel before letting go triggers its action. */
const TRIGGER = 64;

/**
 * A set row that completes (or reopens) when swiped right and asks to be removed when swiped left.
 * The row snaps back after either action; the buttons inside keep working for anyone who does not swipe.
 */
export function SwipeableSetRow({ done, completeLabel, reopenLabel, removeLabel, onSwipeRight, onSwipeLeft, children }: PropsWithChildren<{
  done: boolean;
  completeLabel: string;
  reopenLabel: string;
  removeLabel: string;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
}>) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const swipeable = useRef<SwipeableMethods>(null);

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={1.15}
      overshootFriction={8}
      leftThreshold={TRIGGER}
      rightThreshold={TRIGGER}
      dragOffsetFromLeftEdge={12}
      dragOffsetFromRightEdge={12}
      containerStyle={styles.container}
      renderLeftActions={(progress) => (
        <SwipeAction progress={progress} align="left" color={done ? palette.textMuted : palette.success} icon={done ? 'arrow-undo' : 'checkmark'} label={done ? reopenLabel : completeLabel} />
      )}
      renderRightActions={(progress) => (
        <SwipeAction progress={progress} align="right" color={palette.warning} icon="trash-outline" label={removeLabel} />
      )}
      // RIGHT means the row moved right, revealing the left actions.
      onSwipeableOpen={(direction) => {
        const swipedRight = direction === SwipeDirection.RIGHT;
        swipeable.current?.close();
        tapFeedback(swipedRight && !done ? 'success' : 'light');
        if (swipedRight) onSwipeRight();
        else onSwipeLeft();
      }}
    >
      {/* Opaque so the action panels stay hidden until the row moves. */}
      <View style={{ backgroundColor: palette.surface }}>
        <DoneTint done={done} color={palette.accentSoft} />
        {children}
      </View>
    </ReanimatedSwipeable>
  );
}

function SwipeAction({ progress, align, color, icon, label }: {
  progress: SharedValue<number>;
  align: 'left' | 'right';
  color: string;
  icon: IconName;
  label: string;
}) {
  const styles = useScaledStyles(baseStyles);
  // The icon grows as the row is dragged and "clicks" to full size once letting go would trigger.
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35, 1], [0, 0.6, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(progress.value, [0, 0.9, 1, 1.4], [0.5, 0.9, 1.15, 1.2], Extrapolation.CLAMP) }],
  }));
  return (
    <View style={[styles.action, { backgroundColor: color, justifyContent: align === 'left' ? 'flex-start' : 'flex-end' }]}>
      <Animated.View style={[styles.actionContent, iconStyle]}>
        <Icon name={icon} size={22} color="#FFFFFF" />
        <Text style={[styles.actionText, { color: '#FFFFFF' }]} numberOfLines={1}>{label}</Text>
      </Animated.View>
    </View>
  );
}

/** Springs its child up and back whenever `active` turns on (not on first render). */
export function PopOnActivate({ active, children }: PropsWithChildren<{ active: boolean }>) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const previous = useRef(active);
  useEffect(() => {
    if (active && !previous.current && !reduceMotion) {
      scale.value = withSequence(withTiming(1.28, { duration: 110 }), withSpring(1, { damping: 9, stiffness: 220 }));
    }
    previous.current = active;
  }, [active, reduceMotion, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Tinted backdrop that fades in when a set is completed, so the row fills rather than flips. */
export function DoneTint({ done, color }: { done: boolean; color: string }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(done ? 1 : 0);
  useEffect(() => {
    progress.value = reduceMotion ? (done ? 1 : 0) : withTiming(done ? 1 : 0, { duration: 260 });
  }, [done, progress, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: progress.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color }, style]} />;
}

const baseStyles = StyleSheet.create({
  container: { overflow: 'hidden' },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  actionContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionText: { fontFamily: fonts.semibold, fontSize: 15 },
});
