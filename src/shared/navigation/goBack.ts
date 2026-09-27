import { router, type Href } from 'expo-router';

/** Goes back when there is history (a deep link or notification may open a screen without any). */
export function goBack(fallback: Href = '/(tabs)/today'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
