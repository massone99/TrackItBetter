import { requireOptionalNativeModule } from 'expo-modules-core';

interface RestTimerNative {
  show(endsAtMs: number, title: string, channelName: string): void;
  hide(): void;
}

/** Android only; null on web, iOS and in tests. */
export const RestTimer = requireOptionalNativeModule<RestTimerNative>('RestTimer');
