import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { parseTimedCues, type TimedBeepTone, type TimedMethodCues } from '../../domain/timedMethod';
import { BEEP_TONES, playBeep } from '../../shared/audio/beeps';
import { Icon, IconButton, Label, MenuList, MenuSwitchRow, SegmentedControl, Stepper, Text, tapFeedback } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MIN_TOUCH_TARGET, radii, spacing } from '../../shared/theme/tokens';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

type VolumeKey = '0' | '0.5' | '0.75' | '1';
const PACE_PRESETS = [0, 5, 10, 15, 30] as const;

export function toneLabelKey(tone: TimedBeepTone): string {
  switch (tone) {
    case 'none': return 'timedMethod.toneNone';
    case 'soft': return 'timedMethod.toneSoft';
    case 'tick': return 'timedMethod.toneTick';
    case 'sharp': return 'timedMethod.toneSharp';
    case 'double': return 'timedMethod.toneDouble';
    case 'go': return 'timedMethod.toneGo';
    case 'bell': return 'timedMethod.toneBell';
    case 'done': return 'timedMethod.toneDone';
  }
}

function closestVolumeKey(volume: number): VolumeKey {
  if (volume <= 0.05) return '0';
  if (volume <= 0.62) return '0.5';
  if (volume <= 0.87) return '0.75';
  return '1';
}

export function TimedCuesEditor({ cues, onChange, reps = false }: {
  cues: TimedMethodCues;
  onChange: (next: TimedMethodCues) => void;
  reps?: boolean;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const resolved = parseTimedCues(cues);
  const volume = resolved.volume ?? 1;
  const vibrate = resolved.vibrate !== false;
  const seconds = (value: number) => t('userProgram.secondsValue', { value });

  const preview = (tone: TimedBeepTone, vol = volume, vib = vibrate) => {
    playBeep(tone, { volume: vol > 0 ? vol : 0.75, vibrate: vib });
  };

  const patch = (next: Partial<TimedMethodCues>) => {
    onChange(parseTimedCues({ ...resolved, ...next }));
  };

  const toneRow = (label: string, current: TimedBeepTone, onSelect: (tone: TimedBeepTone) => void) => (
    <View style={[styles.eventCard, { borderColor: palette.border, backgroundColor: palette.surface }]}>
      <View style={styles.eventHead}>
        <Text style={[styles.eventTitle, { color: palette.text }]}>{label}</Text>
        <IconButton
          icon={current === 'none' ? 'volume-mute-outline' : 'volume-high-outline'}
          tone="plain"
          size={44}
          color={current === 'none' ? palette.textMuted : palette.accentStrong}
          label={t('timedMethod.previewTone', { event: label })}
          disabled={current === 'none'}
          onPress={() => preview(current)}
        />
      </View>
      <View style={styles.toneChips}>
        {BEEP_TONES.map((tone) => {
          const selected = current === tone;
          return (
            <Pressable
              key={tone}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${t(toneLabelKey(tone))}`}
              accessibilityState={{ selected }}
              onPress={() => {
                tapFeedback();
                onSelect(tone);
                if (tone !== 'none') preview(tone);
              }}
              style={({ pressed }) => [
                styles.toneChip,
                {
                  borderColor: selected ? palette.accentStrong : palette.border,
                  backgroundColor: selected ? palette.accentSoft : palette.background,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              {selected && tone !== 'none' ? <Icon name="volume-high-outline" size={14} color={palette.accentStrong} /> : null}
              <Text style={[styles.toneText, { color: selected ? palette.accentStrong : palette.text }]}>
                {t(toneLabelKey(tone))}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.section}>
        <Label>{t('timedMethod.beepVolume')}</Label>
        <SegmentedControl
          value={closestVolumeKey(volume)}
          onChange={(next) => {
            const parsed = Number(next);
            patch({ volume: parsed });
            if (parsed > 0) preview(resolved.holdStartTone ?? 'go', parsed, vibrate);
          }}
          options={[
            { value: '0', label: t('timedMethod.volumeMute') },
            { value: '0.5', label: '50%' },
            { value: '0.75', label: '75%' },
            { value: '1', label: '100%' },
          ]}
        />
      </View>

      <MenuList>
        <MenuSwitchRow label={t('timedMethod.vibrateWithBeeps')} value={vibrate} onChange={(value) => patch({ vibrate: value })} />
        <MenuSwitchRow
          label={t(reps ? 'timedMethod.intervalWarningsReps' : 'timedMethod.intervalWarnings')}
          value={resolved.intervalWarnings}
          onChange={(value) => patch({ intervalWarnings: value })}
        />
      </MenuList>

      <Stepper
        layout="row"
        label={t('timedMethod.warningSec')}
        value={resolved.warningSec}
        display={seconds(resolved.warningSec)}
        step={1}
        min={0}
        max={10}
        presets={[0, 1, 3, 5]}
        presetLabel={seconds}
        onChange={(value) => patch({ warningSec: value })}
      />

      {toneRow(t('timedMethod.holdStartSoundLabel'), resolved.holdStart ? (resolved.holdStartTone ?? 'go') : 'none', (tone) =>
        patch({ holdStart: tone !== 'none', holdStartTone: tone }),
      )}
      {toneRow(t('timedMethod.restStartSoundLabel'), resolved.restStart ? (resolved.restStartTone ?? 'double') : 'none', (tone) =>
        patch({ restStart: tone !== 'none', restStartTone: tone }),
      )}
      {toneRow(t('timedMethod.warningSoundLabel'), resolved.warningTone ?? 'tick', (tone) =>
        patch({ warningTone: tone }),
      )}
      {toneRow(t('timedMethod.halfwaySoundLabel'), resolved.halfwayTone ?? 'none', (tone) =>
        patch({ halfwayTone: tone }),
      )}
      {toneRow(t('timedMethod.milestoneSoundLabel'), resolved.milestones ? (resolved.milestoneTone ?? 'done') : 'none', (tone) =>
        patch({ milestones: tone !== 'none', milestoneTone: tone }),
      )}

      <View style={[styles.eventCard, { borderColor: palette.border, backgroundColor: palette.surface }]}>
        <Text style={[styles.eventTitle, { color: palette.text }]}>{t('timedMethod.paceTickLabel')}</Text>
        <View style={styles.toneChips}>
          {PACE_PRESETS.map((step) => {
            const selected = (resolved.intervalTickSec ?? 0) === step;
            const text = step === 0 ? t('timedMethod.paceTickOff') : seconds(step);
            return (
              <Pressable
                key={step}
                accessibilityRole="button"
                accessibilityLabel={`${t('timedMethod.paceTickLabel')}: ${text}`}
                accessibilityState={{ selected }}
                onPress={() => { tapFeedback(); patch({ intervalTickSec: step }); }}
                style={({ pressed }) => [
                  styles.toneChip,
                  {
                    borderColor: selected ? palette.accentStrong : palette.border,
                    backgroundColor: selected ? palette.accentSoft : palette.background,
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Text style={[styles.toneText, { color: selected ? palette.accentStrong : palette.text }]}>{text}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {(resolved.intervalTickSec ?? 0) > 0
        ? toneRow(t('timedMethod.paceTickSoundLabel'), resolved.intervalTickTone ?? 'soft', (tone) => patch({ intervalTickTone: tone }))
        : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  root: { gap: spacing.md },
  section: { gap: spacing.xs },
  eventCard: { borderWidth: 1, borderRadius: radii.control, padding: spacing.sm, gap: spacing.xs },
  eventHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  eventTitle: { flex: 1, minWidth: 0, fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19 },
  toneChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  toneChip: {
    minHeight: MIN_TOUCH_TARGET - 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.control,
  },
  toneText: { fontFamily: fonts.monoSemibold, fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
});
