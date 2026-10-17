import { GoalsPage } from '../src/features/dailyGoals/GoalsPage';

/** This week's goals: same screen as the daily goals, counted Monday to Sunday. */
export default function WeeklyGoalsScreen() {
  return <GoalsPage period="week" />;
}
