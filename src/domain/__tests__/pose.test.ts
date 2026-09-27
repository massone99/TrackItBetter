import { findPosition, jointAngle, KP, levelFor, nextLevelTarget, type Keypoint, type Pose } from '../pose';

const k = (x: number, y: number, score = 0.9): Keypoint => ({ x, y, score });

function poseWith(points: Partial<Record<keyof typeof KP, Keypoint>>): Pose {
  const pose: Pose = Array.from({ length: 17 }, () => k(0, 0, 0.1));
  for (const [name, point] of Object.entries(points)) pose[KP[name as keyof typeof KP]] = point!;
  return pose;
}

describe('jointAngle', () => {
  it('measures right, straight and folded angles', () => {
    expect(jointAngle(k(1, 0), k(0, 0), k(0, 1))).toBeCloseTo(90);
    expect(jointAngle(k(-1, 0), k(0, 0), k(1, 0))).toBeCloseTo(180);
    expect(jointAngle(k(1, 0.001), k(0, 0), k(1, 0))).toBeLessThan(1);
  });
});

describe('positions', () => {
  it('measures a flat front split as ~180° with straight legs', () => {
    const pose = poseWith({
      leftHip: k(100, 100), rightHip: k(100, 100),
      leftKnee: k(50, 100), leftAnkle: k(0, 100),
      rightKnee: k(150, 100), rightAnkle: k(200, 100),
    });
    const result = findPosition('front_split')!.measure(pose, 'left');
    expect(result.value).toBeCloseTo(180);
    expect(result.warning).toBeUndefined();
  });

  it('flags bent knees in a pike fold on the clearer side', () => {
    const pose = poseWith({
      leftShoulder: k(160, 60), leftHip: k(100, 100), leftKnee: k(160, 100), leftAnkle: k(200, 60),
    });
    const result = findPosition('pike')!.measure(pose, null);
    expect(result.value).toBeCloseTo(33.7, 0);
    expect(result.warning).toBe('kneesBent');
  });

  it('scores a straight handstand line near zero deviation', () => {
    const pose = poseWith({
      rightWrist: k(100, 300), rightShoulder: k(100, 220), rightHip: k(100, 120), rightAnkle: k(100, 0),
    });
    expect(findPosition('handstand_line')!.measure(pose, null).value).toBeCloseTo(0);
  });
});

describe('levels', () => {
  it('ranks higher-is-better positions', () => {
    const split = findPosition('front_split')!;
    expect(levelFor(split, 100)).toBe(1);
    expect(levelFor(split, 150)).toBe(3);
    expect(levelFor(split, 179)).toBe(5);
    expect(nextLevelTarget(split, 150)).toBe(160);
    expect(nextLevelTarget(split, 179)).toBeNull();
  });

  it('ranks lower-is-better positions', () => {
    const pike = findPosition('pike')!;
    expect(levelFor(pike, 120)).toBe(1);
    expect(levelFor(pike, 85)).toBe(3);
    expect(levelFor(pike, 40)).toBe(5);
    expect(nextLevelTarget(pike, 85)).toBe(70);
  });
});
