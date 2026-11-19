import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ProgramLayout } from '../../../domain/programStructure';
import { Paged } from '../../../shared/components/paging';
import { ActionButton, Icon, IconButton, Label, tapFeedback, Text, useScrollControl } from '../../../shared/components/ui';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { radii, spacing } from '../../../shared/theme/tokens';
import { fonts } from '../../../shared/theme/typography';
import { useScaledStyles } from '../../../shared/theme/useScaledStyles';
import { useInk } from '../../../shared/theme/ink';
import type { SectionNode } from './groupEdits';

const PAGE = 10;

export interface GroupsViewProps {
  layout: Exclude<ProgramLayout, 'sequence'>;
  sections: readonly SectionNode[];
  /** Sections the person opened or folded by hand; the others follow "current". Not persisted. */
  openMap: Readonly<Record<string, boolean>>;
  onSetOpen: (sectionId: string, open: boolean) => void;
  onMenu: (section: SectionNode) => void;
  onNewGroup: () => void;
  /** Ids of the groups ticked in select mode; null when not selecting. */
  selection?: ReadonlySet<string> | null;
  onToggle?: (groupId: string) => void;
  onSelectAll?: () => void;
  onStartSelect?: () => void;
  /** How a workout shows inside a section. */
  renderSession: (section: SectionNode, sessionIndex: number, mode: 'card' | 'compact') => ReactNode;
  barebone?: boolean;
}

const isOpen = (section: SectionNode, openMap: Readonly<Record<string, boolean>>) => openMap[section.id] ?? (section.current || section.group === null);

/** Weeks and Groups layouts: a week strip (Weeks) and collapsible sections per group. */
export function GroupsView({ layout, sections, openMap, onSetOpen, onMenu, onNewGroup, selection = null, onToggle, onSelectAll, onStartSelect, renderSession, barebone = false }: GroupsViewProps) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const ink = useInk();
  const scroll = useScrollControl();
  const nodes = useRef(new Map<string, View>());
  const grouped = sections.filter((section) => section.group !== null);
  const allGroupIds = sections.flatMap((section) => (section.group ? [section.group.id, ...section.children.map((child) => child.id)] : []));
  const allSelected = selection !== null && allGroupIds.length > 0 && allGroupIds.every((groupId) => selection.has(groupId));

  const jump = (section: SectionNode) => {
    onSetOpen(section.id, true);
    // The section opens first; scroll once it has its new height.
    setTimeout(() => {
      nodes.current.get(section.id)?.measureInWindow((_x, y) => scroll?.scrollTo(Math.max(0, scroll.getOffset() + y - 96)));
    }, 140);
  };

  return (
    <View style={styles.root}>
      {layout === 'weeks' && grouped.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {grouped.map((section) => {
            const done = section.progress.total > 0 && section.progress.done === section.progress.total;
            const color = done ? palette.success : section.current ? palette.accentStrong : palette.textMuted;
            const state = done ? t('programDetail.chipDone', { name: section.group!.name }) : section.current ? t('programDetail.chipCurrent', { name: section.group!.name }) : section.group!.name;
            return (
              <Pressable
                key={section.id}
                accessibilityRole="button"
                accessibilityLabel={state}
                hitSlop={4}
                onPress={() => { tapFeedback(); jump(section); }}
                style={[styles.chip, { borderColor: done ? palette.success : section.current ? palette.accentStrong : ink, backgroundColor: section.current ? palette.accentSoft : palette.surface, borderWidth: section.current ? 1.5 : 1 }]}
              >
                {done ? <Icon name="checkmark" size={14} color={color} /> : null}
                <Text style={[styles.chipText, { color }]} numberOfLines={1}>{section.group!.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {selection !== null && allGroupIds.length > 0 ? (
        <ActionButton icon={allSelected ? 'remove-circle-outline' : 'checkmark-circle-outline'} label={t(allSelected ? 'programDetail.selectNone' : 'programDetail.selectAll')} variant="ghost" onPress={() => onSelectAll?.()} />
      ) : null}

      {sections.map((section) => (
        <View key={section.id} ref={(node) => { if (node) nodes.current.set(section.id, node); else nodes.current.delete(section.id); }} collapsable={false}>
          <Section section={section} layout={layout} openMap={openMap} onSetOpen={onSetOpen} onMenu={onMenu} selection={selection} onToggle={onToggle} renderSession={renderSession} barebone={barebone} />
        </View>
      ))}

      {selection === null ? (
        <>
          <ActionButton icon="add" label={t('programDetail.newGroup')} variant="ghost" onPress={onNewGroup} />
          {allGroupIds.length > 1 && onStartSelect ? <ActionButton icon="checkmark-circle-outline" label={t('programDetail.selectGroups')} variant="ghost" onPress={onStartSelect} /> : null}
        </>
      ) : null}
    </View>
  );
}

function Section({ section, layout, openMap, onSetOpen, onMenu, selection = null, onToggle, renderSession, barebone = false, nested = false }: Pick<GroupsViewProps, 'layout' | 'openMap' | 'onSetOpen' | 'onMenu' | 'renderSession' | 'selection' | 'onToggle' | 'barebone'> & { section: SectionNode; nested?: boolean }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const ink = useInk();
  const open = isOpen(section, openMap);
  const kind = section.group?.kind ?? 'ordered';
  const name = section.group?.name ?? t('programDetail.ungrouped');
  const parts: string[] = [];
  if (section.current) parts.push(t('programDetail.current'));
  if (kind === 'pick') parts.push(t('programDetail.pickOf', { count: section.sessions.length }));
  else if (kind === 'extra') parts.push(t('programDetail.whenever'));
  else if (layout === 'groups' && section.group) parts.push(t('programDetail.inOrder'));
  const compact = layout === 'groups' && (kind === 'pick' || kind === 'extra');
  const selecting = selection !== null && section.group !== null;
  const picked = section.group !== null && (selection?.has(section.group.id) ?? false);
  const complete = section.progress.total > 0 && section.progress.done === section.progress.total;
  const body = (
    <>
      {section.sessions.length === 0 && section.children.length === 0 ? <Text style={[styles.empty, { color: palette.textMuted }]}>{t('programDetail.emptyGroup')}</Text> : null}
      <Paged items={section.sessions} pageSize={PAGE} resetKey={section.id}>
        {(shown) => shown.map((session, index) => (
          <View key={session.id}>{renderSession(section, index, compact ? 'compact' : 'card')}</View>
        ))}
      </Paged>
      {section.children.map((child) => (
        <View key={child.id} style={[styles.child, { borderLeftColor: ink }]}>
          <Section section={child} layout={layout} openMap={openMap} onSetOpen={onSetOpen} onMenu={onMenu} selection={selection} onToggle={onToggle} renderSession={renderSession} barebone={barebone} nested />
        </View>
      ))}
    </>
  );
  const inner = (
    <View style={styles.section}>
      <View style={[styles.head, { borderBottomColor: ink }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={selecting ? { selected: picked } : { expanded: open }}
          accessibilityLabel={selecting ? t('programDetail.selectGroup', { name }) : open ? t('programDetail.collapseGroup', { name }) : t('programDetail.expandGroup', { name })}
          onPress={() => { tapFeedback(); if (selecting && section.group) onToggle?.(section.group.id); else onSetOpen(section.id, !open); }}
          onLongPress={section.group && !selecting ? () => onMenu(section) : undefined}
          style={styles.headMain}
        >
          {selecting ? <Icon name={picked ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={picked ? palette.accentStrong : palette.textMuted} /> : <Icon name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={palette.textMuted} />}
          <View style={styles.headText}>
            {parts.length > 0 ? <Label style={section.current ? { color: palette.accentStrong } : undefined}>{parts.join(' · ')}</Label> : null}
            <Text style={[styles.name, nested && styles.nameNested]}>{name}</Text>
          </View>
          <Text style={[styles.progress, { color: complete ? palette.success : palette.textMuted }]}>{t('programDetail.progress', { done: section.progress.done, total: section.progress.total })}</Text>
        </Pressable>
        {section.group && !selecting ? <IconButton icon="ellipsis-horizontal" tone="plain" label={t('programDetail.groupOptionsFor', { name })} onPress={() => onMenu(section)} /> : null}
      </View>
      {open ? <View style={[styles.body, barebone && styles.bodyBarebone]}>{body}</View> : null}
    </View>
  );
  if (kind !== 'extra') return inner;
  return <View style={[styles.dashed, { borderColor: ink }]}>{inner}</View>;
}

const baseStyles = StyleSheet.create({
  root: { gap: spacing.section },
  strip: { gap: spacing.sm, paddingVertical: 2 },
  chip: { minHeight: 48, minWidth: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: spacing.md, borderRadius: radii.control },
  chipText: { fontFamily: fonts.monoSemibold, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase' },
  section: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1 },
  headMain: { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  headText: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26 },
  nameNested: { fontSize: 18, lineHeight: 22 },
  progress: { fontFamily: fonts.monoSemibold, fontSize: 13 },
  body: { gap: spacing.md },
  bodyBarebone: { gap: 0 },
  child: { marginLeft: spacing.sm, paddingLeft: spacing.md, borderLeftWidth: 1 },
  empty: { fontFamily: fonts.medium, fontSize: 14 },
  dashed: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radii.surface, padding: spacing.md },
});
