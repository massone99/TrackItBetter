import { useLocalSearchParams } from 'expo-router';
import { HistoryPage } from '../src/features/dailyGoals/HistoryPage';

/** Which days and weeks the goals were reached. */
export default function GoalsHistoryScreen() {
  const { period } = useLocalSearchParams<{ period?: string }>();
  return <HistoryPage initialPeriod={period === 'week' ? 'week' : 'day'} />;
}
