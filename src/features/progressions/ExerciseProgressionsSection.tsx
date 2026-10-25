import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { ActionButton, Body, Card, Chip, Icon, IconButton, Label, ListGroup, ListRow, SectionTitle, Sheet, Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { useScaledStyles } from '../../shared/theme/useScaledStyles';
import { formatClock } from '../../shared/utils/format';
import {
  addStep, createChain, deleteLink, getChain, getExerciseProgressions, GraphError, listChains, restoreLink,
  type ChainView, type ExerciseProgressions, type LinkView,
} from './chains';
import { graphProblemText } from './CriteriaEditor';
import { LinkSheet } from './LinkSheet';

type Line = { id: string; depth: number; also: string[] };

/**
 * The progressions of an exercise on its page: the easier exercises above it and the harder ones below
 * (all chains and relations, or one chain), the side relations, and the actions to add, edit and remove them.
 */
export function ExerciseProgressionsSection({ exerciseId, exerciseName }: { exerciseId: string; exerciseName: string }) {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [data, setData] = useState<ExerciseProgressions | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [chainView, setChainView] = useState<ChainView | null>(null);
  const [editing, setEditing] = useState<LinkView | 'new' | null>(null);
  const [addingToChain, setAddingToChain] = useState<ChainView[] | null>(null);
  const [removed, setRemoved] = useState<Awaited<ReturnType<typeof deleteLink>>>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getExerciseProgressions(exerciseId));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [exerciseId]);
  useEffect(() => {
    let alive = true;
    getExerciseProgressions(exerciseId).then((next) => { if (alive) setData(next); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [exerciseId]);
  useEffect(() => {
    if (!filter) return;
    let alive = true;
    getChain(filter).then((chain) => { if (alive) setChainView(chain); }, () => undefined);
    return () => { alive = false; };
  }, [filter]);

  if (failed) {
    return (
      <View style={styles.section}>
        <SectionTitle title={t('chains.sectionTitle')} />
        <ListGroup><ListRow icon="alert-circle-outline" title={t('chains.loadError')} subtitle={t('common.tryAgain')} onPress={() => void load()} /></ListGroup>
      </View>
    );
  }
  if (!data) return <ActivityIndicator color={palette.accentStrong} />;

  const nameOf = (id: string) => (id === exerciseId ? exerciseName : data.names.get(id) ?? id);
  const bestText = (id: string) => {
    const best = data.best.get(id);
    if (!best) return null;
    return best.seconds !== null ? t('chains.bestSeconds', { time: formatClock(best.seconds) }) : best.reps !== null ? t('chains.bestReps', { count: best.reps }) : null;
  };
  // One chain: its steps around this exercise; all: the whole graph.
  const steps = filter && chainView?.id === filter ? chainView.steps : null;
  const at = steps ? steps.findIndex((step) => step.exerciseId === exerciseId) : -1;
  const below: Line[] = steps
    ? steps.slice(0, Math.max(0, at)).reverse().map((step, index) => ({ id: step.exerciseId, depth: index + 1, also: [] }))
    : data.tree.regressions.map((node) => ({ id: node.id, depth: node.depth, also: node.via.length > 1 ? node.via : [] }));
  const above: Line[] = steps
    ? steps.slice(at + 1).map((step, index) => ({ id: step.exerciseId, depth: index + 1, also: [] }))
    : data.tree.progressions.map((node) => ({ id: node.id, depth: node.depth, also: node.via.length > 1 ? node.via : [] }));
  const empty = below.length + above.length + data.tree.prerequisites.length + data.tree.unlocks.length + data.tree.variations.length === 0;

  const line = (item: Line, tone: 'easier' | 'harder') => (
    <Pressable
      key={`${tone}-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${nameOf(item.id)}${data.reached.has(item.id) ? `, ${t('chains.reached')}` : ''}`}
      onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id, instant: '1' } })}
      style={({ pressed }) => [styles.node, { marginLeft: Math.min(item.depth - 1, 4) * 16, borderColor: palette.border, backgroundColor: palette.surface, opacity: pressed ? 0.7 : 1 }]}
    >
      <Icon name={tone === 'easier' ? 'arrow-down' : 'arrow-up'} size={16} color={palette.textMuted} />
      <View style={styles.nodeText}>
        <Text style={[styles.nodeName, { color: palette.text }]}>{nameOf(item.id)}</Text>
        {bestText(item.id) || item.also.length ? (
          <Text style={[styles.nodeMeta, { color: palette.textMuted }]}>
            {[bestText(item.id), item.also.length ? t('chains.alsoUnder', { names: item.also.map(nameOf).join(', ') }) : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      {data.reached.has(item.id) ? <Icon name="checkmark-circle" size={20} color={palette.success} /> : null}
    </Pressable>
  );

  const createHere = async () => {
    const id = await createChain({ name: t('chains.newFrom', { name: exerciseName }), description: '', family: '' }, [exerciseId]);
    router.push({ pathname: '/chain/[id]', params: { id } });
  };
  const addToChain = async (chain: ChainView) => {
    setAddingToChain(null);
    try {
      await addStep(chain.id, exerciseId);
      setMessage(t('chains.addedTo', { name: chain.name }));
      await load();
    } catch (reason) {
      setMessage(reason instanceof GraphError ? graphProblemText(reason.problem, nameOf, t) : t('chains.saveError'));
    }
  };
  const remove = async (link: LinkView) => {
    setEditing(null);
    setRemoved(await deleteLink(link.id));
    await load();
  };

  return (
    <View style={styles.section}>
      <SectionTitle title={t('chains.sectionTitle')} action={<IconButton icon="git-network-outline" label={t('chains.allTitle')} onPress={() => router.push('/progressions')} />} />
      {data.chains.length > 0 ? (
        <View style={styles.chips}>
          <Chip label={t('chains.filterAll')} selected={filter === null} onPress={() => setFilter(null)} />
          {data.chains.map((chain) => (
            <Chip key={chain.id} label={`${chain.name} · ${chain.position}/${chain.count}`} selected={filter === chain.id} onPress={() => setFilter(filter === chain.id ? null : chain.id)} />
          ))}
        </View>
      ) : null}
      {empty ? (
        <Card style={styles.empty}>
          <Body>{t('chains.emptyExercise')}</Body>
        </Card>
      ) : (
        <View style={styles.tree}>
          {above.length > 0 ? <Label>{t('chains.harder')}</Label> : null}
          {[...above].reverse().map((item) => line(item, 'harder'))}
          <View style={[styles.node, styles.current, { borderColor: palette.accentStrong, backgroundColor: palette.accentSoft }]}>
            <Icon name="radio-button-on" size={16} color={palette.accentStrong} />
            <View style={styles.nodeText}>
              <Text style={[styles.nodeName, { color: palette.accentStrong }]}>{exerciseName}</Text>
              {bestText(exerciseId) ? <Text style={[styles.nodeMeta, { color: palette.textMuted }]}>{bestText(exerciseId)}</Text> : null}
            </View>
            {data.reached.has(exerciseId) ? <Icon name="checkmark-circle" size={20} color={palette.success} /> : null}
          </View>
          {below.map((item) => line(item, 'easier'))}
          {below.length > 0 ? <Label>{t('chains.easier')}</Label> : null}
          {!steps && data.tree.prerequisites.length > 0 ? <Body>{t('chains.needs', { names: data.tree.prerequisites.map(nameOf).join(', ') })}</Body> : null}
          {!steps && data.tree.unlocks.length > 0 ? <Body>{t('chains.unlocks', { names: data.tree.unlocks.map(nameOf).join(', ') })}</Body> : null}
          {!steps && data.tree.variations.length > 0 ? <Body>{t('chains.variations', { names: data.tree.variations.map(nameOf).join(', ') })}</Body> : null}
        </View>
      )}
      {filter ? <ActionButton icon="git-commit-outline" variant="ghost" label={t('chains.openChain')} onPress={() => router.push({ pathname: '/chain/[id]', params: { id: filter } })} /> : null}

      {data.links.length > 0 ? (
        <ListGroup>
          {data.links.map((link) => (
            <ListRow
              key={link.id}
              icon={link.kind === 'variation' ? 'swap-horizontal' : link.kind === 'prerequisite' ? 'lock-open-outline' : 'trending-up'}
              title={link.kind === 'variation'
                ? t('chains.linkVariation', { name: nameOf(link.fromId === exerciseId ? link.toId : link.fromId) })
                : link.kind === 'prerequisite'
                  ? link.toId === exerciseId ? t('chains.linkNeeds', { name: nameOf(link.fromId) }) : t('chains.linkNeededFor', { name: nameOf(link.toId) })
                  : link.fromId === exerciseId ? t('chains.linkLeadsTo', { name: nameOf(link.toId) }) : t('chains.linkComesFrom', { name: nameOf(link.fromId) })}
              subtitle={link.note || undefined}
              onPress={() => setEditing(link)}
            />
          ))}
        </ListGroup>
      ) : null}
      {removed ? (
        <Card style={styles.undo}>
          <Body style={styles.undoText}>{t('chains.linkDeleted')}</Body>
          <ActionButton variant="ghost" label={t('chains.restore')} onPress={() => { const row = removed; setRemoved(null); void restoreLink(row).then(load); }} />
        </Card>
      ) : null}
      {message ? <Body accessibilityLiveRegion="polite" style={{ color: palette.textMuted }}>{message}</Body> : null}
      <View style={styles.actions}>
        <View style={styles.action}><ActionButton icon="add" label={t('chains.addLink')} secondary onPress={() => { setMessage(null); setEditing('new'); }} /></View>
        <View style={styles.action}><ActionButton icon="git-commit-outline" label={t('chains.addToChain')} secondary onPress={() => void listChains().then(setAddingToChain)} /></View>
      </View>
      <ActionButton icon="git-branch-outline" variant="ghost" label={t('chains.createHere')} onPress={() => void createHere()} />

      {editing ? (
        <LinkSheet
          key={editing === 'new' ? 'new' : editing.id}
          visible
          exerciseId={exerciseId}
          exerciseName={exerciseName}
          initial={editing === 'new' ? null : editing}
          nameOf={nameOf}
          onSaved={() => { setEditing(null); void load(); }}
          onDelete={editing === 'new' ? undefined : () => void remove(editing)}
          onClose={() => setEditing(null)}
        />
      ) : null}
      <Sheet visible={addingToChain !== null} onClose={() => setAddingToChain(null)} title={t('chains.addToChain')} body={t('chains.addToChainHint')}>
        {addingToChain && addingToChain.length === 0 ? <Body>{t('chains.noChains')}</Body> : null}
        <ListGroup>
          {(addingToChain ?? []).filter((chain) => !chain.steps.some((step) => step.exerciseId === exerciseId)).map((chain) => (
            <ListRow key={chain.id} icon="git-commit-outline" title={chain.name} subtitle={t('chains.stepsCount', { count: chain.steps.length })} onPress={() => void addToChain(chain)} />
          ))}
        </ListGroup>
      </Sheet>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  section: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tree: { gap: 6 },
  node: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1 },
  current: { borderWidth: 2 },
  nodeText: { flex: 1, minWidth: 0 },
  nodeName: { fontFamily: fonts.semibold, fontSize: 15 },
  nodeMeta: { fontSize: 13 },
  empty: { gap: 8 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  undoText: { flex: 1 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1 },
});
