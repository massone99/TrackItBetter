import { SKELETON, type JointAngleId, type Keypoint, type Pose } from '../../../domain/pose';

/**
 * What the photo overlay draws. Each layer can be switched on its own so the body never carries
 * more lines than the user asked for.
 * - skeleton: 'relevant' draws only limbs used by a visible angle, 'full' the whole body.
 * - joints: 'focus' draws the one angle picked in the legend, 'all' every chosen angle.
 */
export interface OverlaySettings {
  skeleton: 'off' | 'relevant' | 'full';
  mainAngle: boolean;
  joints: 'focus' | 'all' | 'off';
}

export const DEFAULT_OVERLAY: OverlaySettings = { skeleton: 'relevant', mainAngle: true, joints: 'focus' };

/** Fixed colours per joint angle (they sit on a photo, so they are not themed). */
export const JOINT_COLORS: Record<JointAngleId, string> = {
  hip: '#4F7DFF',
  shoulder: '#1FB5A6',
  elbow: '#A66BFF',
  knee: '#FF5D8F',
  lean: '#E8B400',
};

export interface OverlayAngle {
  a: Keypoint;
  vertex: Keypoint;
  c: Keypoint;
}

export interface OverlayJoint extends OverlayAngle {
  id: JointAngleId;
}

/** Joint angles to draw for the current settings; `focused` only matters in focus mode. */
export function visibleJoints<T extends OverlayJoint>(joints: readonly T[], settings: OverlaySettings, focused: JointAngleId | null): T[] {
  if (settings.joints === 'off') return [];
  if (settings.joints === 'all') return [...joints];
  return joints.filter((joint) => joint.id === focused);
}

/**
 * Pose indices a set of angles is drawn through. Angles reference the pose's own keypoint objects,
 * so identity finds them; reference points (a hip midpoint, a level line) are not body joints.
 */
export function involvedIndices(pose: Pose, angles: readonly OverlayAngle[]): Set<number> {
  const used = new Set<number>();
  for (const angle of angles) {
    for (const point of [angle.a, angle.vertex, angle.c]) {
      const index = pose.indexOf(point);
      if (index >= 0) used.add(index);
    }
  }
  return used;
}

/** Skeleton segments to draw: none, the whole body, or only limbs touching a visible angle. */
export function skeletonSegments(pose: Pose, angles: readonly OverlayAngle[], mode: OverlaySettings['skeleton']): [number, number][] {
  if (mode === 'off') return [];
  if (mode === 'full') return SKELETON;
  const used = involvedIndices(pose, angles);
  return SKELETON.filter(([from, to]) => used.has(from) && used.has(to));
}

/** Joints to draw as dots: all body joints with the full skeleton, otherwise the ones in use. */
export function handleIndices(pose: Pose, angles: readonly OverlayAngle[], mode: OverlaySettings['skeleton']): number[] {
  // Face points (nose, eyes, ears) are never measured and only add clutter.
  const body = pose.map((_, index) => index).filter((index) => index >= 5);
  if (mode === 'full') return body;
  const used = involvedIndices(pose, angles);
  return body.filter((index) => used.has(index));
}
