import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { ExercisePicker } from '../../src/features/exercises/ExercisePicker';
import {
  addStep, createChain, deleteChain, duplicateChain, getChain, GraphError, listChains, markStepReached, mergeChains, moveStep, removeStep, restoreStep,
  splitChain, updateChain, updateStepCriteria, type ChainView, type Criteria, type StepView,
} from '../../src/features/progressions/chains';
import { CriteriaEditor, criteriaText, graphProblemText } from '../../src/features/progressions/CriteriaEditor';
import { shareChainsFile } from '../../src/features/progressions/exportChains';
import { ActionButton, Body, Card, EmptyState, FooterAction, Icon, IconButton, ListGroup, ListRow, MenuList, MenuRow, PageHeading, Screen, SectionTitle, Sheet, SwitchRow, Text, TextField } from '../../src/shared/components/ui';
import { useTheme } from '../../src/shared/theme/ThemeProvider';
import { fonts } from '../../src/shared/theme/typography';
import { useScaledStyles } from '../../src/shared/theme/useScaledStyles';
import { formatClock } from '../../src/shared/utils/format';
import { radii } from '../../src/shared/theme/tokens';

type Details = { name: string; description: string; family: string };

/** Name, description and skill of a chain, for a new one or an edit. */
function DetailsFields({ value, onChange }: { value: Details; onChange: (next: Details) => void }) {
  const { t } = useTranslation();
  return (
    <>
      <TextField label={t('chains.name')} value={value.name} onChangeText={(name) => onChange({ ...value, name })} placeholder={t('chains.namePlaceholder')} maxLength={80} />
      <TextField label={t('chains.skill')} value={value.family} onChangeText={(family) => onChange({ ...value, family })} placeholder={t('chains.skillPlaceholder')} maxLength={60} />
      <TextField label={t('chains.description')} value={value.description} onChangeText={(description) => onChange({ ...value, description })} placeholder={t('chains.descriptionPlaceholder')} multiline maxLength={500} />
    </>
  );
}

/**
 * One chain: its steps in order with what to reach before the next one, and every change to it
 * (add, insert, reorder, criteria, mark reached, remove with restore, split, merge, duplicate, export,
 * delete). `new` starts an empty chain.
 */
export default function ChainScreen() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { palette } = useTheme();
  const isNew = id === 'new';
  const [chain, setChain] = useState<ChainView | null | undefined>(isNew ? null : undefined);
  const [failed, setFailed] = useState(false);
  const [details, setDetails] = useState<Details>({ name: '', description: '', family: '' });
  const [editingDetails, setEditingDetails] = useState(false);
  const [step, setStep] = useState<StepView | null>(null);
  const [criteria, setCriteria] = useState<Criteria | null>(null);
  const [picking, setPicking] = useState<{ after: string | null } | null>(null);
  const [mergeOptions, setMergeOptions] = useState<ChainView[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removed, setRemoved] = useState<Awaited<ReturnType<typeof removeStep>>>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (isNew) return;
    void getChain(id).then((next) => { setChain(next); setFailed(false); }, () => setFailed(true));
  }, [id, isNew]);
  useFocusEffect(load);

  const nameOf = (exerciseId: string) => chain?.steps.find((item) => item.exerciseId === exerciseId)?.name ?? exerciseId;
  /** Runs a change; a refused one (a loop, a repeat) is explained, then the chain reloads. */
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      setError(null);
    } catch (reason) {
      setError(reason instanceof GraphError ? graphProblemText(reason.problem, nameOf, t) : t('chains.saveError'));
    } finally {
      setBusy(false);
      load();
    }
  };

  if (isNew) {
    return (
      <Screen footer={<FooterAction icon="checkmark" label={busy ? t('chains.saving') : t('chains.create')} disabled={busy || details.name.trim() === ''} onPress={() => {
        setBusy(true);
        void createChain(details).then((created) => router.replace({ pathname: '/chain/[id]', params: { id: created } }), () => { setBusy(false); setError(t('chains.saveError')); });
      }} />}>
        <PageHeading title={t('chains.newChain')} subtitle={t('chains.newSubtitle')} />
        <DetailsFields value={details} onChange={setDetails} />
        {error ? <Body style={{ color: palette.warning }}>{error}</Body> : null}
      </Screen>
    );
  }
  if (failed) {
    return <Screen><EmptyState icon="alert-circle-outline" title={t('common.loadError')} body={t('common.loadErrorBody')} action={<ActionButton icon="refresh" label={t('common.tryAgain')} onPress={load} />} /></Screen>;
  }
  if (chain === undefined) return <Screen><ActivityIndicator color={palette.accentStrong} /></Screen>;
  if (chain === null) return <Screen><PageHeading title={t('chains.missing')} /></Screen>;

  const openStep = (item: StepView) => { setStep(item); setCriteria(item.criteria); };
  const index = step ? chain.steps.findIndex((item) => item.id === step.id) : -1;
  const best = (item: StepView) => (item.best.seconds !== null ? t('chains.bestSeconds', { time: formatClock(item.best.seconds) }) : item.best.reps !== null ? t('chains.bestReps', { count: item.best.reps }) : null);

  return (
    <Screen
      footer={(
        <>
          <FooterAction icon="trending-up" label={t('chains.viewProgress')} secondary disabled={chain.steps.length === 0} onPress={() => router.push({ pathname: '/skill/[chainId]', params: { chainId: chain.id } })} />
          <FooterAction icon="add" label={t('chains.addStep')} disabled={busy} onPress={() => setPicking({ after: null })} />
        </>
      )}
    >
      <PageHeading
        title={chain.name}
        subtitle={[chain.family || null, t('chains.stepsCount', { count: chain.steps.length }), t('chains.reachedOf', { done: chain.reachedLevel, total: chain.steps.length })].filter(Boolean).join(' · ')}
        action={<IconButton icon="create-outline" label={t('chains.editDetails')} onPress={() => { setDetails({ name: chain.name, description: chain.description, family: chain.family }); setEditingDetails(true); }} />}
      />
      {chain.description ? <Body>{chain.description}</Body> : null}
      {error ? <Body accessibilityLiveRegion="polite" style={{ color: palette.warning }}>{error}</Body> : null}
      {removed ? (
        <Card style={styles.undo}>
          <Body style={styles.undoText}>{t('chains.stepRemoved', { name: nameOf(removed.row.exerciseId) === removed.row.exerciseId ? '' : nameOf(removed.row.exerciseId) })}</Body>
          <ActionButton variant="ghost" label={t('chains.restore')} onPress={() => { const value = removed; setRemoved(null); void run(() => restoreStep(value)); }} />
        </Card>
      ) : null}

      {chain.steps.length === 0 ? (
        <EmptyState icon="git-commit-outline" title={t('chains.noStepsTitle')} body={t('chains.noStepsBody')} action={<ActionButton icon="add" label={t('chains.addStep')} onPress={() => setPicking({ after: null })} />} />
      ) : (
        <View style={styles.steps}>
          {chain.steps.map((item, position) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${t('chains.stepNumber', { number: position + 1 })}, ${item.name}${item.reached ? `, ${t('chains.reached')}` : ''}`}
              onPress={() => openStep(item)}
              style={({ pressed }) => [styles.step, { borderColor: item.reached ? palette.success : palette.border, backgroundColor: palette.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.badge, { backgroundColor: item.reached ? palette.success : palette.accentSoft }]}>
                {item.reached ? <Icon name="checkmark" size={16} color={palette.successText} /> : <Text style={[styles.badgeText, { color: palette.accentStrong }]}>{position + 1}</Text>}
              </View>
              <View style={styles.stepText}>
                <Text style={[styles.stepName, { color: palette.text }]}>{item.name}</Text>
                <Text style={[styles.stepMeta, { color: palette.textMuted }]}>
                  {[criteriaText(item.criteria, t) ?? t('chains.noCriteria'), best(item)].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={palette.textMuted} />
            </Pressable>
          ))}
        </View>
      )}

      <SectionTitle title={t('chains.moreTitle')} />
      <MenuList>
        <MenuRow icon="copy-outline" label={t('chains.duplicate')} onPress={() => void run(async () => { const copy = await duplicateChain(chain.id, t('chains.copyName', { name: chain.name })); if (copy) router.push({ pathname: '/chain/[id]', params: { id: copy } }); })} />
        <MenuRow icon="git-merge-outline" label={t('chains.merge')} onPress={() => void listChains().then((all) => setMergeOptions(all.filter((item) => item.id !== chain.id)))} />
        <MenuRow icon="share-outline" label={t('chains.exportOne')} onPress={() => void shareChainsFile([chain.id], t('chains.exportTitle')).then((result) => setError(result === 'unavailable' ? t('chains.shareUnavailable') : null), () => setError(t('chains.exportError')))} />
        <MenuRow icon="trash-outline" tone="danger" label={t('chains.deleteChain')} onPress={() => setConfirmDelete(true)} />
      </MenuList>

      <Sheet visible={editingDetails} onClose={() => setEditingDetails(false)} title={t('chains.editDetails')}>
        <DetailsFields value={details} onChange={setDetails} />
        <ActionButton icon="checkmark" label={t('chains.save')} disabled={details.name.trim() === ''} onPress={() => { setEditingDetails(false); void run(() => updateChain(chain.id, details)); }} />
      </Sheet>

      <Sheet visible={step !== null && picking === null} onClose={() => setStep(null)} title={step ? `${t('chains.stepNumber', { number: index + 1 })} · ${step.name}` : ''}>
        {step ? (
          <>
            <CriteriaEditor value={criteria} onChange={setCriteria} />
            <ActionButton icon="checkmark" label={t('chains.saveCriteria')} onPress={() => { const target = step; setStep(null); void run(() => updateStepCriteria(target.id, criteria)); }} />
            <SwitchRow icon="checkmark-circle-outline" title={t('chains.markReached')} subtitle={t('chains.markReachedHint')} value={step.reachedAt !== null} onChange={(on) => { const target = step; setStep(null); void run(() => markStepReached(target.id, on)); }} />
            <ListGroup>
              <ListRow icon="barbell-outline" title={t('chains.openExercise')} onPress={() => { const target = step; setStep(null); router.push({ pathname: '/exercise/[id]', params: { id: target.exerciseId } }); }} />
              <ListRow icon="add-circle-outline" title={t('chains.insertAfter')} onPress={() => setPicking({ after: step.id })} />
            </ListGroup>
            <View style={styles.row}>
              <View style={styles.cell}><ActionButton icon="arrow-up" label={t('chains.moveUp')} secondary disabled={index <= 0} onPress={() => { const target = step; setStep(null); void run(() => moveStep(target.id, -1)); }} /></View>
              <View style={styles.cell}><ActionButton icon="arrow-down" label={t('chains.moveDown')} secondary disabled={index >= chain.steps.length - 1} onPress={() => { const target = step; setStep(null); void run(() => moveStep(target.id, 1)); }} /></View>
            </View>
            {index > 0 ? <ActionButton icon="cut-outline" variant="ghost" label={t('chains.splitHere')} onPress={() => { const target = step; setStep(null); void run(async () => { const created = await splitChain(target.id, t('chains.splitName', { name: chain.name })); if (created) router.push({ pathname: '/chain/[id]', params: { id: created } }); }); }} /> : null}
            <ActionButton icon="remove-circle-outline" variant="danger" label={t('chains.removeStep')} onPress={() => { const target = step; setStep(null); void run(async () => setRemoved(await removeStep(target.id))); }} />
          </>
        ) : null}
      </Sheet>

      <ExercisePicker
        visible={picking !== null}
        title={picking?.after ? t('chains.insertAfter') : t('chains.addStep')}
        include={(choice) => !chain.steps.some((item) => item.exerciseId === choice.id)}
        onChoose={(choice) => { const after = picking?.after ?? null; setPicking(null); setStep(null); void run(() => addStep(chain.id, choice.id, after)); }}
        onCreate={(typed) => { setPicking(null); router.push({ pathname: '/exercise/new', params: typed ? { name: typed } : {} }); }}
        onClose={() => setPicking(null)}
      />

      <Sheet visible={mergeOptions !== null} onClose={() => setMergeOptions(null)} title={t('chains.merge')} body={t('chains.mergeBody', { name: chain.name })}>
        {mergeOptions && mergeOptions.length === 0 ? <Body>{t('chains.noOtherChains')}</Body> : null}
        <ListGroup>
          {(mergeOptions ?? []).map((other) => (
            <ListRow key={other.id} icon="git-merge-outline" title={other.name} subtitle={t('chains.stepsCount', { count: other.steps.length })} onPress={() => { setMergeOptions(null); void run(() => mergeChains(chain.id, other.id)); }} />
          ))}
        </ListGroup>
      </Sheet>

      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('chains.deleteTitle', { name: chain.name })} body={t('chains.deleteBody')}>
        <ActionButton icon="trash-outline" variant="danger" label={t('chains.deleteChain')} onPress={() => { setConfirmDelete(false); void deleteChain(chain.id).then(() => router.back()); }} />
        <ActionButton label={t('common.cancel')} secondary onPress={() => setConfirmDelete(false)} />
      </Sheet>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  steps: { gap: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.control, borderWidth: 1 },
  badge: { width: 32, height: 32, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.bold, fontSize: 15 },
  stepText: { flex: 1, minWidth: 0 },
  stepName: { fontFamily: fonts.semibold, fontSize: 16 },
  stepMeta: { fontSize: 13 },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  undoText: { flex: 1 },
  row: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1 },
});
