import { findPosition, KP, type Keypoint, type Pose } from '../../../../domain/pose';
import { DEFAULT_OVERLAY, handleIndices, skeletonSegments, visibleJoints } from '../model';

const k = (x: number, y: number): Keypoint => ({ x, y, score: 0.9 });
const pose: Pose = Array.from({ length: 17 }, (_, index) => k(index * 10, index * 5));

describe('overlay model', () => {
  const planche = findPosition('full_planche')!;
  const measurement = planche.measure(pose, null);
  const joints = measurement.joints!;

  it('shows only the focused angle in focus mode and none until one is picked', () => {
    expect(visibleJoints(joints, DEFAULT_OVERLAY, null)).toEqual([]);
    expect(visibleJoints(joints, DEFAULT_OVERLAY, 'elbow').map((joint) => joint.id)).toEqual(['elbow']);
    expect(visibleJoints(joints, { ...DEFAULT_OVERLAY, joints: 'all' }, null)).toHaveLength(joints.length);
    expect(visibleJoints(joints, { ...DEFAULT_OVERLAY, joints: 'off' }, 'elbow')).toEqual([]);
  });

  it('draws only limbs used by visible angles unless the whole body is asked for', () => {
    const elbow = joints.filter((joint) => joint.id === 'elbow');
    const relevant = skeletonSegments(pose, elbow, 'relevant');
    const side = relevant.flat();
    expect(relevant.length).toBe(2);
    expect(side.every((index) => [KP.leftShoulder, KP.leftElbow, KP.leftWrist, KP.rightShoulder, KP.rightElbow, KP.rightWrist].includes(index))).toBe(true);
    expect(skeletonSegments(pose, elbow, 'off')).toEqual([]);
    expect(skeletonSegments(pose, elbow, 'full').length).toBeGreaterThan(relevant.length);
  });

  it('never draws face points as handles', () => {
    expect(handleIndices(pose, joints, 'full').every((index) => index >= KP.leftShoulder)).toBe(true);
    expect(handleIndices(pose, [], 'relevant')).toEqual([]);
  });
});
