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
  | 'front_split' | 'middle_split' | 'pike' | 'pancake' | 'bridge' | 'shoulder_flexion' | 'deep_squat' | 'handstand_line';

export interface PoseMeasurement {
  /** Primary value in degrees. */
  value: number;
  /** Joints drawn as the measured angle: [a, vertex, c] (vertex may be a hip midpoint, index -1). */
  angle: { a: Keypoint; vertex: Keypoint; c: Keypoint };
  /** Mean confidence of the joints used. */
  confidence: number;
  /** Form issue to point out, as a translation key. */
  warning?: 'kneesBent' | 'elbowsBent';
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
