import { WorkoutRecap } from '../../../src/features/session/WorkoutRecap';

/** A finished workout opened from the Log: the recap, with Edit and Repeat. */
export default function WorkoutRecapScreen() {
  return <WorkoutRecap mode="log" />;
}
