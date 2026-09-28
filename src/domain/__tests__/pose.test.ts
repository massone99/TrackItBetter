import { findPosition, jointAngle, KP, levelFor, nextLevelTarget, POSITION_GROUPS, POSITIONS, selectedJoints, type Keypoint, type Pose } from '../pose';

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

  it('measures the tuck planche back angle, treating hips above the shoulders as flat', () => {
    const tuck = findPosition('tuck_planche')!;
    const arms = { rightWrist: k(100, 200), rightElbow: k(100, 150) };
    const dropped = poseWith({ ...arms, rightShoulder: k(100, 100), rightHip: k(0, 100 + 100 * Math.tan(Math.PI / 6)) });
    expect(tuck.measure(dropped, null).value).toBeCloseTo(30);
    const high = poseWith({ ...arms, rightShoulder: k(100, 100), rightHip: k(0, 80) });
    expect(tuck.measure(high, null).value).toBeCloseTo(0);
    expect(tuck.measure(high, null).warning).toBeUndefined();
  });

  it('adds body tilt and hip bend for a full planche, facing either way, and flags bent elbows', () => {
    const planche = findPosition('full_planche')!;
    const flat = poseWith({ leftWrist: k(100, 200), leftElbow: k(100, 150), leftShoulder: k(100, 100), leftHip: k(200, 100), leftAnkle: k(300, 100) });
    expect(planche.measure(flat, null).value).toBeCloseTo(0);
    // Mirrored, feet raised 10° above the shoulders, hips piked 20° and elbows bent.
    const ankle = k(100 - 300 * Math.cos(Math.PI / 18), 100 - 300 * Math.sin(Math.PI / 18));
    const hip = k(0, 100 - 100 * Math.tan(Math.PI / 18) + 60);
    const bent = poseWith({ rightWrist: k(160, 180), rightElbow: k(100, 150), rightShoulder: k(100, 100), rightHip: hip, rightAnkle: ankle });
    const result = planche.measure(bent, null);
    const hipBend = 180 - jointAngle(k(100, 100), hip, ankle);
    expect(result.value).toBeCloseTo(10 + hipBend);
    expect(result.warning).toBe('elbowsBent');
  });

  it('reports every planche joint angle, hip first', () => {
    const pose = poseWith({
      leftWrist: k(100, 200), leftElbow: k(100, 150), leftShoulder: k(150, 100),
      leftHip: k(250, 100), leftKnee: k(300, 150), leftAnkle: k(300, 200),
    });
    const joints = findPosition('tuck_planche')!.measure(pose, null).joints!;
    const byId = Object.fromEntries(joints.map((joint) => [joint.id, joint.value]));
    expect(joints[0].id).toBe('hip');
    expect(byId.hip).toBeCloseTo(135);
    expect(byId.shoulder).toBeCloseTo(135);
    expect(byId.elbow).toBeCloseTo(135);
    expect(byId.knee).toBeCloseTo(135);
    expect(byId.lean).toBeCloseTo(26.6, 1);
  });
});

describe('lever, push-up and L-sit positions', () => {
  it('scores a horizontal front lever as flat and flags bent arms', () => {
    // Hanging from a bar above the shoulders, body straight and level.
    const flat = poseWith({ leftWrist: k(100, 0), leftElbow: k(100, 50), leftShoulder: k(100, 100), leftHip: k(200, 100), leftKnee: k(250, 100), leftAnkle: k(300, 100) });
    const lever = findPosition('front_lever')!;
    expect(lever.measure(flat, null).value).toBeCloseTo(0);
    expect(lever.measure(flat, null).warning).toBeUndefined();
    const bent = poseWith({ leftWrist: k(160, 20), leftElbow: k(100, 50), leftShoulder: k(100, 100), leftHip: k(200, 100), leftAnkle: k(300, 100) });
    expect(lever.measure(bent, null).warning).toBe('elbowsBent');
  });

  it('counts a tuck lever back that tilts either way', () => {
    const tuck = findPosition('tuck_front_lever')!;
    const arms = { rightWrist: k(100, 0), rightElbow: k(100, 50), rightShoulder: k(100, 100) };
    const low = poseWith({ ...arms, rightHip: k(0, 100 + 100 * Math.tan(Math.PI / 9)) });
    const high = poseWith({ ...arms, rightHip: k(0, 100 - 100 * Math.tan(Math.PI / 9)) });
    expect(tuck.measure(low, null).value).toBeCloseTo(20);
    expect(tuck.measure(high, null).value).toBeCloseTo(20);
  });

  it('measures the pseudo planche push-up lean past the hands, higher is better', () => {
    const pppu = findPosition('pseudo_planche_pushup')!;
    const pose = poseWith({ leftWrist: k(100, 200), leftElbow: k(125, 150), leftShoulder: k(150, 100), leftHip: k(300, 110), leftAnkle: k(450, 120) });
    expect(pppu.measure(pose, null).value).toBeCloseTo(26.6, 1);
    expect(levelFor(pppu, 26.6)).toBe(3);
  });

  it('measures L-sit legs below horizontal and treats raised legs as level', () => {
    const lsit = findPosition('l_sit')!;
    const dropped = poseWith({ leftShoulder: k(100, 0), leftElbow: k(100, 50), leftWrist: k(100, 100), leftHip: k(100, 100), leftKnee: k(150, 100 + 50 * Math.tan(Math.PI / 12)), leftAnkle: k(200, 100 + 100 * Math.tan(Math.PI / 12)) });
    expect(lsit.measure(dropped, null).value).toBeCloseTo(15);
    const vsit = poseWith({ leftShoulder: k(100, 0), leftElbow: k(100, 50), leftWrist: k(100, 100), leftHip: k(100, 100), leftKnee: k(150, 80), leftAnkle: k(200, 60) });
    expect(lsit.measure(vsit, null).value).toBeCloseTo(0);
  });
});

describe('position groups', () => {
  it('puts every position in a known group and leaves no group empty', () => {
    expect(POSITIONS.every((position) => (POSITION_GROUPS as readonly string[]).includes(position.group))).toBe(true);
    for (const group of POSITION_GROUPS) expect(POSITIONS.some((position) => position.group === group)).toBe(true);
  });
});

describe('joint selection', () => {
  it('offers only joints each position measures, with defaults drawn from them', () => {
    for (const position of POSITIONS) {
      const measured = position.measure(poseWith({}), null).joints!.map((joint) => joint.id);
      expect(measured).toEqual(position.joints);
      expect(position.defaultJoints.every((id) => position.joints.includes(id))).toBe(true);
    }
  });

  it('uses defaults until the user chooses, then keeps the position order', () => {
    const planche = findPosition('full_planche')!;
    expect(selectedJoints(planche, null)).toEqual(planche.defaultJoints);
    expect(selectedJoints(planche, ['lean', 'hip', 'nose'])).toEqual(['hip', 'lean']);
    expect(selectedJoints(planche, [])).toEqual([]);
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
