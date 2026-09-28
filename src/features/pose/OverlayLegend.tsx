import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { JointAngleId } from '../../domain/pose';
import { Chip, Label, tapFeedback, Text } from '../../shared/components/ui';
import { readPreference, writePreference } from '../../shared/settings/preferences';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { DEFAULT_OVERLAY, JOINT_COLORS, type OverlaySettings } from './overlay/model';

const KEY = 'pose.overlay';

function readSettings(): OverlaySettings {
  try {
    const parsed: unknown = JSON.parse(readPreference(KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return DEFAULT_OVERLAY;
    const value = parsed as Partial<OverlaySettings>;
    return {
      skeleton: value.skeleton === 'off' || value.skeleton === 'full' ? value.skeleton : 'relevant',
      mainAngle: value.mainAngle !== false,
      joints: value.joints === 'all' || value.joints === 'off' ? value.joints : 'focus',
    };
  } catch {
    return DEFAULT_OVERLAY;
  }
}

/** Overlay layers, remembered on this device for every position. */
export function useOverlaySettings(): [OverlaySettings, (next: OverlaySettings) => void] {
  const [settings, setSettings] = useState(readSettings);
  const update = (next: OverlaySettings) => {
    setSettings(next);
    writePreference(KEY, JSON.stringify(next));
  };
  return [settings, update];
}

export interface LegendAngle {
  id: JointAngleId;
  name: string;
  value: string;
}

/**
 * Colour key and switches for the photo overlay. Tapping an angle focuses it on the photo; the
 * switches turn the skeleton, the measured angle and "all angles at once" on or off.
 */
export function OverlayLegend({ angles, settings, focused, onSettings, onFocus }: {
  angles: LegendAngle[];
  settings: OverlaySettings;
  focused: JointAngleId | null;
  onSettings: (next: OverlaySettings) => void;
  onFocus: (id: JointAngleId | null) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const showAll = settings.joints === 'all';

  const pressAngle = (id: JointAngleId) => {
    tapFeedback();
    if (showAll) {
      // From "all", tapping one angle narrows the photo down to it.
      onSettings({ ...settings, joints: 'focus' });
      onFocus(id);
      return;
    }
    onFocus(focused === id ? null : id);
  };

  return (
    <View style={styles.root}>
      {angles.length > 0 ? (
        <>
          <Label>{showAll ? t('pose.legendAll') : t('pose.legendFocus')}</Label>
          <View style={styles.angles}>
            {angles.map((angle) => {
              const on = showAll || focused === angle.id;
              const color = JOINT_COLORS[angle.id];
              return (
                <Pressable
                  key={angle.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${angle.name} ${angle.value}`}
                  hitSlop={4}
                  onPress={() => pressAngle(angle.id)}
                  style={({ pressed }) => [styles.angle, {
                    borderColor: color,
                    backgroundColor: on ? color : palette.surface,
                    opacity: pressed ? 0.8 : 1,
                  }]}
                >
                  <View style={[styles.dot, { backgroundColor: on ? '#FFFFFF' : color }]} />
                  <Text style={[styles.angleName, { color: on ? '#FFFFFF' : palette.text }]}>{angle.name}</Text>
                  <Text style={[styles.angleValue, { color: on ? '#FFFFFF' : palette.text }]}>{angle.value}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
      <View style={styles.toggles}>
        <Chip
          icon={settings.skeleton !== 'off' ? 'checkmark' : 'add'}
          label={t('pose.layerSkeleton')}
          selected={settings.skeleton !== 'off'}
          onPress={() => onSettings({ ...settings, skeleton: settings.skeleton === 'off' ? 'relevant' : 'off' })}
        />
        <Chip
          icon={settings.skeleton === 'full' ? 'checkmark' : 'add'}
          label={t('pose.layerFullBody')}
          selected={settings.skeleton === 'full'}
          onPress={() => onSettings({ ...settings, skeleton: settings.skeleton === 'full' ? 'relevant' : 'full' })}
        />
        <Chip
          icon={settings.mainAngle ? 'checkmark' : 'add'}
          label={t('pose.layerMain')}
          selected={settings.mainAngle}
          onPress={() => onSettings({ ...settings, mainAngle: !settings.mainAngle })}
        />
        {angles.length > 1 ? (
          <Chip
            icon={showAll ? 'checkmark' : 'add'}
            label={t('pose.layerAllAngles')}
            selected={showAll}
            onPress={() => onSettings({ ...settings, joints: showAll ? 'focus' : 'all' })}
          />
        ) : null}
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  root: { gap: 8 },
  angles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  angle: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 12, borderRadius: 999, borderWidth: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  angleName: { fontFamily: fonts.medium, fontSize: 14 },
  angleValue: { fontFamily: fonts.display, fontSize: 17 },
  toggles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
});
