import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { POSITION_GROUPS, POSITIONS, type PositionDefinition, type PositionGroup, type PositionId } from '../../domain/pose';
import { Card, Icon, Label, ListRow, Sheet, tapFeedback, Text } from '../../shared/components/ui';
import type { IconName } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';

export const GROUP_ICONS: Record<PositionGroup, IconName> = {
  splits: 'resize-outline',
  folds: 'body-outline',
  shoulders: 'accessibility-outline',
  balance: 'hand-left-outline',
  planche: 'barbell-outline',
  levers: 'git-commit-outline',
};

export function positionsIn(group: PositionGroup): PositionDefinition[] {
  return POSITIONS.filter((position) => position.group === group);
}

/**
 * Positions under expandable family headers, so no long list has to be scrolled. Groups listed in
 * `initiallyOpen` start expanded.
 */
export function PositionAccordion({ initiallyOpen = [], selected, subtitle, trailing, onSelect }: {
  initiallyOpen?: PositionGroup[];
  selected?: PositionId;
  /** Per-position subtitle; defaults to the filming hint. */
  subtitle?: (position: PositionDefinition) => string;
  trailing?: (position: PositionDefinition) => ReactNode;
  onSelect: (id: PositionId) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [open, setOpen] = useState<Set<PositionGroup>>(() => new Set(initiallyOpen));
  const toggle = (group: PositionGroup) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(group)) next.delete(group); else next.add(group);
    return next;
  });

  return (
    <View style={styles.groups}>
      {POSITION_GROUPS.map((group) => {
        const expanded = open.has(group);
        const positions = positionsIn(group);
        const names = positions.map((position) => t(`pose.positions.${position.id}.name`)).join(' · ');
        return (
          <View key={group} style={[styles.group, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => { tapFeedback(); toggle(group); }}
              style={({ pressed }) => [styles.header, { backgroundColor: pressed ? palette.surfaceMuted : 'transparent' }]}
            >
              <View style={[styles.icon, { backgroundColor: palette.accentSoft }]}>
                <Icon name={GROUP_ICONS[group]} size={18} color={palette.accentStrong} />
              </View>
              <View style={styles.copy}>
                <Text style={[styles.title, { color: palette.text }]}>{t(`pose.groups.${group}`)}</Text>
                {expanded ? null : <Text numberOfLines={1} style={[styles.names, { color: palette.textMuted }]}>{names}</Text>}
              </View>
              <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textMuted} />
            </Pressable>
            {expanded ? positions.map((position) => (
              <View key={position.id} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }}>
                <ListRow
                  title={t(`pose.positions.${position.id}.name`)}
                  subtitle={subtitle ? subtitle(position) : t(`pose.positions.${position.id}.how`)}
                  tint={position.id === selected ? palette.accent : undefined}
                  icon={position.id === selected ? 'checkmark-circle' : undefined}
                  onPress={() => onSelect(position.id)}
                  trailing={trailing?.(position)}
                />
              </View>
            )) : null}
          </View>
        );
      })}
    </View>
  );
}

/** Compact "Position: … · Change" card that opens the accordion in a sheet. */
export function PositionPicker({ value, onChange }: { value: PositionDefinition; onChange: (id: PositionId) => void }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card style={styles.picker}>
        <View style={[styles.icon, { backgroundColor: palette.accentSoft }]}>
          <Icon name={GROUP_ICONS[value.group]} size={18} color={palette.accentStrong} />
        </View>
        <View style={styles.copy}>
          <Label>{t('pose.position')}</Label>
          <Text style={[styles.title, { color: palette.text }]}>{t(`pose.positions.${value.id}.name`)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pose.changePosition')}
          hitSlop={8}
          onPress={() => { tapFeedback(); setOpen(true); }}
          style={({ pressed }) => [styles.change, { backgroundColor: palette.accentSoft, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.changeText, { color: palette.accentStrong }]}>{t('pose.changeAction')}</Text>
        </Pressable>
      </Card>
      <Sheet visible={open} onClose={() => setOpen(false)} title={t('pose.choosePosition')}>
        <PositionAccordion
          initiallyOpen={[value.group]}
          selected={value.id}
          onSelect={(id) => { setOpen(false); onChange(id); }}
        />
      </Sheet>
    </>
  );
}

const baseStyles = StyleSheet.create({
  groups: { gap: 10 },
  group: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 11 },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.semibold, fontSize: 16 },
  names: { fontFamily: fonts.body, fontSize: 13 },
  picker: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  change: { paddingHorizontal: 14, height: 38, borderRadius: 12, justifyContent: 'center' },
  changeText: { fontFamily: fonts.semibold, fontSize: 15 },
});
