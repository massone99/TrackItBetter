import { router } from 'expo-router';
import { tapFeedback } from '../../shared/components/ui';

/** Long-press shortcut used wherever an exercise is listed: opens its page to view or edit it. */
export function openExercisePage(exerciseId: string): void {
  tapFeedback('success');
  router.push({ pathname: '/exercise/[id]', params: { id: exerciseId } });
}
