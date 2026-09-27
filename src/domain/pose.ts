/** COCO keypoint order used by MoveNet. */
export const KEYPOINT_NAMES = [
  'nose', 'leftEye', 'rightEye', 'leftEar', 'rightEar',
  'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist',
  'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle',
] as const;

export type KeypointName = (typeof KEYPOINT_NAMES)[number];

/** A body joint in image pixels, with the model's confidence (1 once placed by hand). */
export interface Keypoint {
  x: number;
  y: number;
  score: number;
}

export type Pose = Keypoint[];

export const KP = Object.fromEntries(KEYPOINT_NAMES.map((name, index) => [name, index])) as Record<KeypointName, number>;

/** Limb segments drawn as the skeleton. */
export const SKELETON: [number, number][] = [
  [KP.leftShoulder, KP.rightShoulder], [KP.leftHip, KP.rightHip],
  [KP.leftShoulder, KP.leftHip], [KP.rightShoulder, KP.rightHip],
  [KP.leftShoulder, KP.leftElbow], [KP.leftElbow, KP.leftWrist],
  [KP.rightShoulder, KP.rightElbow], [KP.rightElbow, KP.rightWrist],
  [KP.leftHip, KP.leftKnee], [KP.leftKnee, KP.leftAnkle],
  [KP.rightHip, KP.rightKnee], [KP.rightKnee, KP.rightAnkle],
];

/** Below this score a joint is treated as a guess and drawn hollow. */
export const LOW_CONFIDENCE = 0.3;

/** Interior angle at `b`, in degrees (0–180). */
export function jointAngle(a: Keypoint, b: Keypoint, c: Keypoint): number {
  const v1x = a.x - b.x; const v1y = a.y - b.y;
  const v2x = c.x - b.x; const v2y = c.y - b.y;
  const length = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (length === 0) return 0;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / length));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function midpoint(a: Keypoint, b: Keypoint): Keypoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, score: Math.min(a.score, b.score) };
}

export type PoseSide = 'left' | 'right';
export type PositionId =
  | 'front_split' | 'middle_split' | 'pike' | 'pancake' | 'bridge' | 'shoulder_flexion' | 'deep_squat' | 'handstand_line'
  | 'tuck_planche' | 'full_planche';

export interface PoseMeasurement {
  /** Primary value in degrees. */
  value: number;
  /** Joints drawn as the measured angle: [a, vertex, c] (vertex may be a hip midpoint, index -1). */
  angle: { a: Keypoint; vertex: Keypoint; c: Keypoint };
  /** Mean confidence of the joints used. */
  confidence: number;
  /** Form issue to point out, as a translation key. */
  warning?: 'kneesBent' | 'elbowsBent';
  /** Every joint angle that matters for the position, most important first. */
  joints?: JointAngle[];
}

export type JointAngleId = 'hip' | 'shoulder' | 'elbow' | 'knee' | 'lean';

/** One labelled joint angle: the angle at `vertex` between `a` and `c`, in degrees. */
export interface JointAngle {
  id: JointAngleId;
  value: number;
  a: Keypoint;
  vertex: Keypoint;
  c: Keypoint;
}

export interface PositionDefinition {
  id: PositionId;
  /** Asks which side (leg forward / arm measured) the capture shows. */
  sideAware: boolean;
  better: 'higher' | 'lower';
  /** Four thresholds splitting levels 1–5, ordered from easiest to hardest. */
  thresholds: [number, number, number, number];
  measure: (pose: Pose, side: PoseSide | null) => PoseMeasurement;
}

function pick(pose: Pose, side: PoseSide, left: number, right: number): Keypoint {
  return pose[side === 'left' ? left : right];
}

/** Side with the more confident joints, for positions filmed side-on. */
export function clearerSide(pose: Pose, joints: [number, number][]): PoseSide {
  const score = (side: 0 | 1) => joints.reduce((sum, pair) => sum + pose[pair[side]].score, 0);
  return score(0) >= score(1) ? 'left' : 'right';
}

function triple(pose: Pose, side: PoseSide, a: [number, number], b: [number, number], c: [number, number]) {
  const ka = pick(pose, side, ...a); const kb = pick(pose, side, ...b); const kc = pick(pose, side, ...c);
  return { a: ka, vertex: kb, c: kc, value: jointAngle(ka, kb, kc), confidence: (ka.score + kb.score + kc.score) / 3 };
}

const SHOULDER: [number, number] = [KP.leftShoulder, KP.rightShoulder];
const ELBOW: [number, number] = [KP.leftElbow, KP.rightElbow];
const WRIST: [number, number] = [KP.leftWrist, KP.rightWrist];
const HIP: [number, number] = [KP.leftHip, KP.rightHip];
const KNEE: [number, number] = [KP.leftKnee, KP.rightKnee];
const ANKLE: [number, number] = [KP.leftAnkle, KP.rightAnkle];

/** Angle between the two legs, measured at the centre of the hips (straight line = 180°). */
function legSpread(pose: Pose): PoseMeasurement {
  const hip = midpoint(pose[KP.leftHip], pose[KP.rightHip]);
  const left = pose[KP.leftAnkle].score >= LOW_CONFIDENCE ? pose[KP.leftAnkle] : pose[KP.leftKnee];
  const right = pose[KP.rightAnkle].score >= LOW_CONFIDENCE ? pose[KP.rightAnkle] : pose[KP.rightKnee];
  const kneesStraight = jointAngle(pose[KP.leftHip], pose[KP.leftKnee], pose[KP.leftAnkle]) >= 160
    && jointAngle(pose[KP.rightHip], pose[KP.rightKnee], pose[KP.rightAnkle]) >= 160;
  return {
    value: jointAngle(left, hip, right),
    angle: { a: left, vertex: hip, c: right },
    confidence: (left.score + hip.score + right.score) / 3,
    warning: kneesStraight ? undefined : 'kneesBent',
  };
}

function hipFold(pose: Pose): PoseMeasurement {
  const side = clearerSide(pose, [SHOULDER, HIP, KNEE]);
  const fold = triple(pose, side, SHOULDER, HIP, KNEE);
  const knee = triple(pose, side, HIP, KNEE, ANKLE);
  return { value: fold.value, angle: fold, confidence: fold.confidence, warning: knee.value < 160 ? 'kneesBent' : undefined };
}

/**
 * Angle between the `from`→`to` line and the horizontal, whichever way the body faces. With
 * `ignoreAbove`, a `to` higher than `from` counts as level (0°). The angle is drawn against a
 * horizontal reference point at `from`.
 */
function tiltFromHorizontal(from: Keypoint, to: Keypoint, ignoreAbove = false): Omit<PoseMeasurement, 'confidence' | 'warning'> {
  const dx = to.x - from.x;
  // Image y grows downwards, so a positive angle means `to` sits below `from`.
  const signed = (Math.atan2(to.y - from.y, Math.abs(dx)) * 180) / Math.PI;
  const level = { x: from.x + (dx >= 0 ? 1 : -1) * Math.hypot(dx, to.y - from.y), y: from.y, score: from.score };
  return { value: ignoreAbove ? Math.max(0, signed) : Math.abs(signed), angle: { a: to, vertex: from, c: level } };
}

/**
 * Planche positions are filmed side-on: measure the clearer side, check the arms are locked and
 * report every joint angle, starting with the hip (torso to thigh).
 */
function planche(pose: Pose, measure: (side: PoseSide) => { value: number; angle: PoseMeasurement['angle']; confidence: number }): PoseMeasurement {
  const side = clearerSide(pose, [WRIST, SHOULDER, HIP]);
  const joint = (id: JointAngleId, a: [number, number], b: [number, number], c: [number, number]): JointAngle => {
    const { a: ka, vertex, c: kc, value } = triple(pose, side, a, b, c);
    return { id, value, a: ka, vertex, c: kc };
  };
  const elbow = joint('elbow', SHOULDER, ELBOW, WRIST);
  // Lean: how far the shoulders sit past the hands, as the wrist–shoulder line's angle from vertical.
  const wrist = pick(pose, side, ...WRIST);
  const shoulder = pick(pose, side, ...SHOULDER);
  const up = { x: wrist.x, y: wrist.y - Math.hypot(shoulder.x - wrist.x, shoulder.y - wrist.y), score: wrist.score };
  const lean: JointAngle = { id: 'lean', value: jointAngle(shoulder, wrist, up), a: shoulder, vertex: wrist, c: up };
  return {
    ...measure(side),
    warning: elbow.value < 160 ? 'elbowsBent' : undefined,
    joints: [joint('hip', SHOULDER, HIP, KNEE), joint('shoulder', ELBOW, SHOULDER, HIP), elbow, joint('knee', HIP, KNEE, ANKLE), lean],
  };
}

export const POSITIONS: PositionDefinition[] = [
  { id: 'front_split', sideAware: true, better: 'higher', thresholds: [120, 140, 160, 175], measure: legSpread },
  { id: 'middle_split', sideAware: false, better: 'higher', thresholds: [110, 130, 150, 170], measure: legSpread },
  { id: 'pike', sideAware: false, better: 'lower', thresholds: [110, 90, 70, 50], measure: hipFold },
  { id: 'pancake', sideAware: false, better: 'lower', thresholds: [120, 100, 80, 60], measure: hipFold },
  {
    id: 'bridge', sideAware: false, better: 'higher', thresholds: [120, 140, 155, 170],
    measure: (pose) => {
      const side = clearerSide(pose, [WRIST, SHOULDER, HIP]);
      const opening = triple(pose, side, WRIST, SHOULDER, HIP);
      const elbow = triple(pose, side, SHOULDER, ELBOW, WRIST);
      return { value: opening.value, angle: opening, confidence: opening.confidence, warning: elbow.value < 160 ? 'elbowsBent' : undefined };
    },
  },
  {
    id: 'shoulder_flexion', sideAware: true, better: 'higher', thresholds: [140, 155, 165, 175],
    measure: (pose, side) => {
      const flexion = triple(pose, side ?? clearerSide(pose, [HIP, SHOULDER, ELBOW]), HIP, SHOULDER, ELBOW);
      return { value: flexion.value, angle: flexion, confidence: flexion.confidence };
    },
  },
  {
    id: 'deep_squat', sideAware: false, better: 'lower', thresholds: [110, 90, 70, 50],
    measure: (pose) => {
      const knee = triple(pose, clearerSide(pose, [HIP, KNEE, ANKLE]), HIP, KNEE, ANKLE);
      return { value: knee.value, angle: knee, confidence: knee.confidence };
    },
  },
  {
    id: 'handstand_line', sideAware: false, better: 'lower', thresholds: [40, 30, 20, 10],
    measure: (pose) => {
      const side = clearerSide(pose, [WRIST, SHOULDER, HIP, ANKLE]);
      const shoulder = triple(pose, side, WRIST, SHOULDER, HIP);
      const hip = triple(pose, side, SHOULDER, HIP, ANKLE);
      // Total bend away from a straight wrist–shoulder–hip–ankle line.
      const deviation = (180 - shoulder.value) + (180 - hip.value);
      return { value: deviation, angle: hip, confidence: (shoulder.confidence + hip.confidence) / 2 };
    },
  },
  {
    // Back angle: 0° when the hips are level with (or above) the shoulders.
    id: 'tuck_planche', sideAware: false, better: 'lower', thresholds: [40, 30, 20, 10],
    measure: (pose) => planche(pose, (side) => {
      const shoulder = pick(pose, side, ...SHOULDER);
      const hip = pick(pose, side, ...HIP);
      return { ...tiltFromHorizontal(shoulder, hip, true), confidence: (shoulder.score + hip.score) / 2 };
    }),
  },
  {
    // Total bend away from a horizontal shoulder–hip–ankle line: body tilt plus hip pike or sag.
    id: 'full_planche', sideAware: false, better: 'lower', thresholds: [40, 30, 20, 10],
    measure: (pose) => planche(pose, (side) => {
      const shoulder = pick(pose, side, ...SHOULDER);
      const ankle = pick(pose, side, ...ANKLE);
      const hip = triple(pose, side, SHOULDER, HIP, ANKLE);
      const tilt = tiltFromHorizontal(shoulder, ankle);
      return { value: tilt.value + (180 - hip.value), angle: tilt.angle, confidence: (shoulder.score + ankle.score + hip.vertex.score) / 3 };
    }),
  },
];

export function findPosition(id: string): PositionDefinition | undefined {
  return POSITIONS.find((position) => position.id === id);
}

/** Level 1–5 for a measured value. */
export function levelFor(position: PositionDefinition, value: number): number {
  const passed = position.thresholds.filter((threshold) => (position.better === 'higher' ? value >= threshold : value <= threshold)).length;
  return passed + 1;
}

/** Value needed for the next level, or null at level 5. */
export function nextLevelTarget(position: PositionDefinition, value: number): number | null {
  const level = levelFor(position, value);
  return level >= 5 ? null : position.thresholds[level - 1];
}
