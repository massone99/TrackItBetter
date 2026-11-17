import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionButton, Body, Sheet } from '../../shared/components/ui';
import { discardActiveWorkout } from './discardWorkout';

/**
 * Shown when a workout is started while another is still open: offers to go back to it and, when
 * `onDiscarded` is given, to throw it away (after a confirmation) and carry on with the start.
 */
export function WorkoutInProgressSheet({ active, onClose, onDiscarded }: {
  active: { id: string; name: string } | null;
  onClose: () => void;
  /** Called once the open workout is gone: starts what the user wanted to start. */
  onDiscarded?: () => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const close = () => { setConfirming(false); setFailed(false); onClose(); };
  const discard = async () => {
    if (!active || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await discardActiveWorkout(active.id);
    } catch {
      setBusy(false);
      setFailed(true);
      return;
    }
    setBusy(false);
    setConfirming(false);
    onClose();
    onDiscarded?.();
  };

  return (
    <Sheet visible={active !== null} onClose={close} title={t(confirming ? 'workout.discardTitle' : 'workout.inProgressTitle')} body={active ? t(confirming ? 'workout.inProgressDiscardBody' : 'workout.inProgressBody', { name: active.name }) : undefined}>
      {confirming ? (
        <>
          {failed ? <Body>{t('workout.inProgressDiscardError')}</Body> : null}
          <ActionButton icon="trash-outline" variant="danger" label={t('workout.inProgressDiscardConfirm')} onPress={() => void discard()} disabled={busy} />
          <ActionButton label={t('common.back')} secondary onPress={() => { setConfirming(false); setFailed(false); }} />
        </>
      ) : (
        <>
          <ActionButton icon="play" label={t('common.resumeWorkout')} onPress={() => { const id = active?.id; close(); if (id) router.push({ pathname: '/workout/[id]', params: { id } }); }} />
          {onDiscarded ? <ActionButton icon="trash-outline" label={t('workout.inProgressDiscard')} secondary onPress={() => setConfirming(true)} /> : null}
          <ActionButton label={t('common.close')} secondary onPress={close} />
        </>
      )}
    </Sheet>
  );
}
