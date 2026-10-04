import { useEffect, type PropsWithChildren } from 'react';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useAnimationSettings } from '../settings/AnimationProvider';

/**
 * A moment of arrival for something earned (the finished-workout badge): it grows from slightly
 * smaller and settles with a soft spring. With reduced motion it simply appears.
 */
export function Arrive({ children }: PropsWithChildren) {
  const systemReduce = useReducedMotion();
  const { reducedMotion, speed } = useAnimationSettings();
  const calm = systemReduce || reducedMotion || speed === 'off';
  const progress = useSharedValue(calm ? 1 : 0);
  useEffect(() => {
    if (calm) { progress.value = 1; return; }
    progress.value = withSpring(1, { damping: 11, stiffness: 140 });
  }, [calm, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(progress.value > 0.05 ? 1 : 0, { duration: 120 }),
    transform: [{ scale: 0.6 + 0.4 * progress.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
