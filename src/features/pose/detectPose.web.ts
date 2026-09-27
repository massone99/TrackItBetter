import type { Pose } from '../../domain/pose';

// The on-device model runtime is native-only; the web build shows pose check as unavailable.
export const poseDetectionAvailable = false;

export async function detectPose(): Promise<{ pose: Pose; width: number; height: number }> {
  throw new Error('Pose detection is available in the Android and iOS apps.');
}
