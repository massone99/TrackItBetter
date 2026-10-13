import { WorkoutRecap } from '../../../src/features/session/WorkoutRecap';

/** Right after finishing: the recap, with Done back to Today. */
export default function WorkoutSummaryScreen() {
  return <WorkoutRecap mode="finish" />;
}
