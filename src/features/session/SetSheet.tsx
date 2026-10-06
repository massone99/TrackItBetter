import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { HoldMode } from '../../domain/holdTimer';
import { poseDetectionAvailable } from '../pose/detectPose';
import { ActionButton, Body, Label, SegmentedControl, Sheet, TextField } from '../../shared/components/ui';
import { formatClock } from '../../shared/utils/format';
import { describePreviousSet } from './ExerciseCard';
import { FormRating } from './LastTime';
import { removeSetWithUndo, setSetFormRating, updateSetNote, updateSetRpe, type PreviousSetValues, type RemovedRows, type SessionExercise, type SessionSet } from './repository';
import { RpePicker } from './RpePicker';

/**
 * Per-set details kept out of the row, for the workout in progress and a finished one: RPE, form,
 * note, video, pose analysis, L/R pair and removal. The live-only parts (hold timer mode, done
 * without the timer, copy last time) show when their handlers are given.
 */
export function SetSheet({ exercise, set, holdMode, onHoldMode, onClose, onChanged, onRemoved, onCompleteManually, lastTime, onCopyLast, onPair }: {
  exercise: SessionExercise;
  set: SessionSet;
  holdMode?: HoldMode;
  onHoldMode?: (mode: HoldMode) => void;
  onClose: () => void;
  onChanged: () => Promise<void>;
  /** Called with what was removed when the removal can be undone. */
  onRemoved: (removed: RemovedRows | null) => void;
  /** Completes a hold with its entered time, skipping the timer. */
  onCompleteManually?: () => void;
  /** Last time's set at the same position, which can be copied into this one. */
  lastTime?: PreviousSetValues | null;
  onCopyLast?: (values: PreviousSetValues) => void;
  /** Splits the set into left and right, or edits its pair (a finished workout). */
  onPair?: () => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState(set.note ?? '');
  const [rpe, setRpe] = useState(set.rpe);
  const [form, setForm] = useState(set.formRating);
  const [confirming, setConfirming] = useState(false);
  // Clips cannot be restored, so only a set with clips asks first; any other removal can be undone.
  const needsConfirm = set.clipCount > 0;
  const timed = exercise.metric === 'time' || exercise.metric === 'time_load';

  const saveNote = async () => {
    if ((set.note ?? '') === note.trim()) return;
    await updateSetNote(set.id, note);
    await onChanged();
  };
  const close = () => {
    onClose();
    void saveNote();
  };
  const openVideo = () => {
    close();
    router.push({ pathname: '/form-check/[setId]', params: { setId: set.id } });
  };
  const remove = async () => {
    if (needsConfirm && !confirming) { setConfirming(true); return; }
    onClose();
    onRemoved(await removeSetWithUndo(set.id));
    await onChanged();
  };

  return (
    <Sheet
      visible
      onClose={close}
      title={`${exercise.name} · ${t('logger.setTitle', { number: set.index })}`}
      body={confirming ? t('logger.removeCompletedWarning') : undefined}
    >
      {confirming ? null : (
        <>
          {timed && holdMode && onHoldMode ? (
            <View style={{ gap: 6 }}>
              <Label>{t('logger.holdMode')}</Label>
              <SegmentedControl<HoldMode>
                value={holdMode}
                onChange={onHoldMode}
                options={[{ value: 'free', label: t('logger.holdFree') }, { value: 'target', label: t('logger.holdTarget') }]}
              />
              <Body>{holdMode === 'target' ? t('logger.holdTargetHint', { time: formatClock(set.durationSec ?? 0) }) : t('logger.holdFreeHint')}</Body>
            </View>
          ) : null}
          {timed && !set.completedAt && onCompleteManually ? (
            <View style={{ gap: 6 }}>
              <ActionButton
                icon="checkmark"
                label={t('logger.markDoneWithTime', { time: formatClock(set.durationSec ?? 0) })}
                secondary
                onPress={() => { close(); onCompleteManually(); }}
              />
              <Body>{t('logger.holdLongPressHint')}</Body>
            </View>
          ) : null}
          {lastTime && onCopyLast && !set.completedAt ? (
            <ActionButton icon="arrow-undo-outline" label={t('logger.copyPrevious', { value: describePreviousSet(lastTime, exercise.metric) })} secondary onPress={() => onCopyLast(lastTime)} />
          ) : null}
          <RpePicker value={rpe} onChange={(next) => { setRpe(next); void updateSetRpe(set.id, next).then(onChanged); }} />
          {set.kind === 'working' ? <FormRating value={form} onChange={(next) => { setForm(next); void setSetFormRating(set.id, next).then(onChanged); }} /> : null}
          <TextField
            label={t('logger.noteLabel')}
            value={note}
            onChangeText={setNote}
            placeholder={t('logger.notePlaceholder')}
            multiline
            maxLength={500}
          />
          <ActionButton
            icon={set.clipCount > 0 ? 'play-circle-outline' : 'videocam-outline'}
            label={set.clipCount > 0 ? t('logger.videoView', { count: set.clipCount }) : t('logger.videoAttach')}
            secondary
            onPress={openVideo}
          />
          {(set.poseCount ?? 0) > 0 ? (
            <ActionButton icon="scan-outline" label={t('poseLink.setActionCount', { count: set.poseCount })} secondary onPress={() => { close(); router.push({ pathname: '/pose/[positionId]', params: { positionId: 'free', setId: set.id } }); }} />
          ) : null}
          {onPair ? (
            <ActionButton icon="git-compare-outline" label={set.pairId ? t('history.editPair') : t('history.convertPair')} secondary onPress={() => { close(); onPair(); }} />
          ) : null}
          {poseDetectionAvailable ? (
            <ActionButton icon="body-outline" label={t('poseLink.setAction')} secondary onPress={() => { close(); router.push({ pathname: '/pose/new', params: { positionId: 'free', setId: set.id } }); }} />
          ) : null}
        </>
      )}
      <ActionButton icon="trash-outline" label={confirming ? t('logger.confirmRemove') : t('logger.removeSet')} variant="danger" onPress={() => void remove()} />
      {confirming
        ? <ActionButton label={t('common.cancel')} secondary onPress={() => setConfirming(false)} />
        : <ActionButton label={t('logger.done')} onPress={close} />}
    </Sheet>
  );
}
