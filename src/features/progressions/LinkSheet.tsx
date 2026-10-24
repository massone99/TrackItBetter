import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { ActionButton, Body, Chip, Label, ListGroup, ListRow, Sheet, TextField } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ExercisePicker } from '../exercises/ExercisePicker';
import { addLink, GraphError, updateLink, type Criteria, type LinkView } from './chains';
import { CriteriaEditor, graphProblemText } from './CriteriaEditor';

/** How a relation reads from the exercise whose page it is on. */
type Direction = 'progression' | 'regression' | 'prerequisite' | 'variation';

function directionOf(link: LinkView, exerciseId: string): Direction {
  if (link.kind === 'variation') return 'variation';
  if (link.kind === 'prerequisite') return 'prerequisite';
  return link.fromId === exerciseId ? 'progression' : 'regression';
}

/**
 * Adds or edits a single relation of an exercise: what it is to the other exercise (a progression,
 * a regression, a prerequisite or a variation), the other exercise, what to reach and a note. A loop,
 * a duplicate or a relation to itself is shown here, before anything is saved.
 */
export function LinkSheet({ visible, exerciseId, exerciseName, initial, nameOf, onSaved, onDelete, onClose }: {
  visible: boolean;
  exerciseId: string;
  exerciseName: string;
  initial: LinkView | null;
  nameOf: (id: string) => string;
  onSaved: () => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [direction, setDirection] = useState<Direction>(initial ? directionOf(initial, exerciseId) : 'progression');
  const [other, setOther] = useState<{ id: string; name: string } | null>(initial
    ? { id: initial.fromId === exerciseId ? initial.toId : initial.fromId, name: initial.fromId === exerciseId ? initial.toName : initial.fromName }
    : null);
  const [criteria, setCriteria] = useState<Criteria | null>(initial?.criteria ?? null);
  const [note, setNote] = useState(initial?.note ?? '');
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!other) return;
    const input = direction === 'regression' || direction === 'prerequisite'
      ? { fromId: other.id, toId: exerciseId }
      : { fromId: exerciseId, toId: other.id };
    const kind = direction === 'regression' ? 'progression' : direction;
    setBusy(true);
    try {
      const full = { ...input, kind, criteria: kind === 'variation' ? null : criteria, note } as const;
      if (initial) await updateLink(initial.id, full);
      else await addLink(full);
      setError(null);
      onSaved();
    } catch (reason) {
      setError(reason instanceof GraphError ? graphProblemText(reason.problem, (id) => (id === exerciseId ? exerciseName : id === other.id ? other.name : nameOf(id)), t) : t('chains.saveError'));
    } finally {
      setBusy(false);
    }
  };

  const hint = other ? t(`chains.directionHint.${direction}`, { name: exerciseName, other: other.name }) : t('chains.pickOtherHint');
  return (
    <>
      <Sheet visible={visible && !picking} onClose={onClose} title={t(initial ? 'chains.editLink' : 'chains.addLink')}>
        <Label>{t('chains.relationTitle')}</Label>
        <View style={styles.chips}>
          {(['progression', 'regression', 'prerequisite', 'variation'] as const).map((value) => (
            <Chip key={value} label={t(`chains.kind.${value}`)} selected={direction === value} icon={direction === value ? 'checkmark' : undefined} onPress={() => { setDirection(value); setError(null); }} />
          ))}
        </View>
        <ListGroup>
          <ListRow icon="barbell-outline" title={other?.name ?? t('chains.pickOther')} subtitle={hint} onPress={() => setPicking(true)} />
        </ListGroup>
        {direction !== 'variation' ? <CriteriaEditor value={criteria} onChange={setCriteria} /> : null}
        <TextField label={t('chains.note')} value={note} onChangeText={setNote} placeholder={t('chains.notePlaceholder')} maxLength={500} />
        {error ? <Body accessibilityLiveRegion="polite" style={{ color: palette.warning }}>{error}</Body> : null}
        <View style={styles.actions}>
          <ActionButton icon="checkmark" label={busy ? t('chains.saving') : t('chains.save')} disabled={!other || busy} onPress={() => void save()} />
          {onDelete ? <ActionButton icon="trash-outline" variant="danger" label={t('chains.deleteLink')} onPress={onDelete} /> : null}
        </View>
      </Sheet>
      <ExercisePicker
        visible={visible && picking}
        title={t('chains.pickOther')}
        include={(choice) => choice.id !== exerciseId}
        onChoose={(choice) => { setOther({ id: choice.id, name: choice.name }); setError(null); setPicking(false); }}
        onClose={() => setPicking(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
