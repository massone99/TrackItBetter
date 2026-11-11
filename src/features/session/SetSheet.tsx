import { ExerciseRestFields } from './ExerciseRestFields';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { HoldMode } from '../../domain/holdTimer';
import { poseDetectionAvailable } from '../pose/detectPose';
import { ActionButton, Body, Chip, IconButton, Label, MenuList, MenuRow, SegmentedControl, Sheet, TextField } from '../../shared/components/ui';
import { formatClock, formatNumber } from '../../shared/utils/format';
import { formatRpe } from '../../domain/rpe';
import { ScaleRow } from './ScaleRow';
import { describePreviousSet } from './ExerciseCard';
import { removeSetWithUndo, setSetFormRating, setSetRomRating, updateSetNote, updateSetRpe, type PreviousSetValues, type RemovedRows, type SessionExercise, type SessionSet } from './repository';
import { SetBandsField } from '../equipment/SetBandsField';
import { bandsById, describeSetBands, useEquipment } from '../equipment/useEquipment';

/**
 * Per-set details kept out of the row, for the workout in progress and a finished one: RPE, form,
 * note, video, pose analysis, L/R pair and removal. The live-only parts (hold timer mode, done
 * without the timer, copy last time) show when their handlers are given.
 */
export function SetSheet({ initialView, exercise, set, holdMode, onHoldMode, onClose, onChanged, onRemoved, onCompleteManually, lastTime, onCopyLast, onPair }: {
  /** Opens straight on the set's bands or its note. */
  initialView?: 'bands' | 'note' | 'rest';
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
  const [rom, setRom] = useState(set.romRating);
  const [confirming, setConfirming] = useState(false);
  // Bands open in their own view of the sheet, so the main view stays short.
  const [bandsOpen, setBandsOpen] = useState(initialView === 'bands');
  const [restOpen, setRestOpen] = useState(initialView === 'rest');
  // The ⋮ menu in the header: rare actions and removal.
  const [moreOpen, setMoreOpen] = useState(false);
  const { catalog } = useEquipment();
  const bandsText = catalog ? describeSetBands(set, bandsById(catalog), t)?.text ?? null : null;
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

  const valueText = timed ? formatClock(set.durationSec ?? 0) : exercise.metric === 'distance' ? `${formatNumber(set.distanceM ?? 0)} m` : `${set.reps ?? 0} ${t('history.units.reps')}`;
  const subtitle = [valueText, set.addedLoadKg ? `${formatNumber(set.addedLoadKg)} kg` : null, set.completedAt ? t('history.setCompleted') : null].filter(Boolean).join(' · ');
  const mainView = !(confirming || bandsOpen || restOpen);

  return (
    <Sheet
      visible
      onClose={close}
      title={restOpen ? `${t('logger.restGroup')} · ${exercise.name}` : bandsOpen ? `${t('bands.title')} · ${t('logger.setTitle', { number: set.index })}` : `${exercise.name} · ${t('logger.setTitle', { number: set.index })}`}
      subtitle={mainView ? subtitle : undefined}
      headerAction={mainView ? <IconButton icon="ellipsis-vertical" label={t('logger.moreSetActions')} tone="plain" onPress={() => setMoreOpen(!moreOpen)} /> : undefined}
      body={confirming ? t('logger.removeCompletedWarning') : undefined}
    >
      {restOpen ? (
        <>
          <ExerciseRestFields exercise={exercise} onSaved={() => void onChanged()} />
          {initialView === 'rest' ? <ActionButton label={t('logger.done')} onPress={close} /> : <ActionButton icon="arrow-back" label={t('bands.back')} onPress={() => setRestOpen(false)} />}
        </>
      ) : null}
      {bandsOpen ? (
        <>
          <SetBandsField exercise={exercise} set={set} onChanged={onChanged} />
          <ActionButton icon="arrow-back" label={t('bands.back')} onPress={() => setBandsOpen(false)} />
        </>
      ) : null}
      {mainView ? (
        <>
          {/* The ⋮ menu: what is used rarely (copy last time, L/R pair, pose, removal) stays out of the way. */}
          {moreOpen ? (
            <MenuList>
              {lastTime && onCopyLast && !set.completedAt ? <MenuRow icon="arrow-undo-outline" label={t('logger.copyPrevious', { value: describePreviousSet(lastTime, exercise.metric) })} onPress={() => { setMoreOpen(false); onCopyLast(lastTime); }} /> : null}
              {onPair ? <MenuRow icon="git-compare-outline" label={set.pairId ? t('history.editPair') : t('history.convertPair')} onPress={() => { close(); onPair(); }} /> : null}
              {(set.poseCount ?? 0) > 0 ? <MenuRow icon="scan-outline" label={t('poseLink.setActionCount', { count: set.poseCount })} onPress={() => { close(); router.push({ pathname: '/pose/[positionId]', params: { positionId: 'free', setId: set.id } }); }} /> : null}
              {poseDetectionAvailable ? <MenuRow icon="body-outline" label={t('poseLink.setAction')} onPress={() => { close(); router.push({ pathname: '/pose/new', params: { positionId: 'free', setId: set.id } }); }} /> : null}
              <MenuRow icon="trash-outline" label={t('logger.removeSet')} tone="danger" onPress={() => void remove()} />
            </MenuList>
          ) : null}
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
          {/* Ratings first: each is one tap on its row. */}
          <ScaleRow
            label={t('ledger.rpe')}
            hint={set.targetRpe !== null ? t('activeSet.target', { value: formatRpe(set.targetRpe) }) : null}
            values={RPE_WHOLE}
            value={rpe}
            half
            halfLabel={t('logger.halfPoint')}
            valueLabel={(value) => t('logger.rpeTag', { value: formatRpe(value) })}
            onChange={(next) => { setRpe(next); void updateSetRpe(set.id, next).then(onChanged); }}
          />
          {set.kind === 'working' ? (
            <ScaleRow
              label={t('ledger.form')}
              values={FORM_WHOLE}
              value={form}
              half
              halfLabel={t('logger.halfPoint')}
              valueLabel={(value) => t('lastTime.formRating', { value: formatNumber(value) })}
              onChange={(next) => { setForm(next); void setSetFormRating(set.id, next).then(onChanged); }}
            />
          ) : null}
          {set.kind === 'working' ? (
            <ScaleRow
              label={t('ledger.rom')}
              values={FORM_WHOLE}
              value={rom}
              half
              halfLabel={t('logger.halfPoint')}
              valueLabel={(value) => t('lastTime.romRating', { value: formatNumber(value) })}
              onChange={(next) => { setRom(next); void setSetRomRating(set.id, next).then(onChanged); }}
            />
          ) : null}
          <TextField
            label={t('logger.noteLabel')}
            value={note}
            onChangeText={setNote}
            placeholder={t('logger.notePlaceholder')}
            multiline
            autoFocus={initialView === 'note'}
            maxLength={500}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip icon="git-commit-outline" label={bandsText ?? t('bands.chipEmpty')} selected={Boolean(bandsText)} onPress={() => setBandsOpen(true)} />
            <Chip icon="timer-outline" label={set.restSec !== null ? t('logger.restChip', { value: formatClock(set.restSec) }) : t('logger.restGroup')} selected={set.restSec !== null} onPress={() => setRestOpen(true)} />
            <Chip icon={set.clipCount > 0 ? 'play-circle-outline' : 'videocam-outline'} label={set.clipCount > 0 ? t('logger.clip', { count: set.clipCount }) : t('logger.videoChip')} selected={set.clipCount > 0} onPress={openVideo} />
          </View>
        </>
      ) : null}
      {confirming ? <ActionButton icon="trash-outline" label={t('logger.confirmRemove')} variant="danger" onPress={() => void remove()} /> : null}
      {bandsOpen || restOpen ? null : confirming
        ? <ActionButton label={t('common.cancel')} secondary onPress={() => setConfirming(false)} />
        : <ActionButton label={t('logger.done')} onPress={close} />}
    </Sheet>
  );
}

/** Whole values of each scale; the half points come from the row's "+½" toggle. */
const RPE_WHOLE = [6, 7, 8, 9, 10] as const;
const FORM_WHOLE = [1, 2, 3, 4, 5] as const;
