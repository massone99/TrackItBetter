import { AccessibilityInfo } from "react-native";
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { readAnimationPreference, writePreference, ANIMATION_PREFERENCE_KEY, type AnimationSpeed } from "./preferences";

type AnimationContextValue = {
  speed: AnimationSpeed;
  setSpeed: (speed: AnimationSpeed) => void;
  reducedMotion: boolean;
  duration: (normal: number) => number;
};

const AnimationContext = createContext<AnimationContextValue>({
  speed: "normal",
  setSpeed: () => undefined,
  reducedMotion: false,
  duration: (normal) => normal,
});

export function AnimationProvider({ children }: PropsWithChildren) {
  const [speed, setSpeedState] = useState(readAnimationPreference);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  const setSpeed = useCallback((next: AnimationSpeed) => {
    setSpeedState(next);
    writePreference(ANIMATION_PREFERENCE_KEY, next);
  }, []);

  const duration = useCallback((normal: number) => {
    if (reducedMotion || speed === "off") return 0;
    return speed === "fast" ? Math.max(80, Math.round(normal * 0.55)) : normal;
  }, [reducedMotion, speed]);

  const value = useMemo(() => ({ speed, setSpeed, reducedMotion, duration }), [speed, setSpeed, reducedMotion, duration]);
  return <AnimationContext.Provider value={value}>{children}</AnimationContext.Provider>;
}

export function useAnimationSettings() {
  return useContext(AnimationContext);
}
