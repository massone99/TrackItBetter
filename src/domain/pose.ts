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
  | 'tuck_planche' | 'full_planche' | 'pseudo_planche_pushup' | 'tuck_front_lever' | 'front_lever' | 'back_lever' | 'l_sit';

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

/** Families positions are grouped in when picking one, in display order. */
export const POSITION_GROUPS = ['splits', 'folds', 'shoulders', 'balance', 'planche', 'levers'] as const;
export type PositionGroup = (typeof POSITION_GROUPS)[number];

export interface PositionDefinition {
  id: PositionId;
  group: PositionGroup;
  /** Asks which side (leg forward / arm measured) the capture shows. */
  sideAware: boolean;
  better: 'higher' | 'lower';
  /** Four thresholds splitting levels 1–5, ordered from easiest to hardest. */
  thresholds: [number, number, number, number];
  /** Joint angles the user can add to the analysis, in display order. */
  joints: JointAngleId[];
  /** Joint angles shown until the user picks their own. */
  defaultJoints: JointAngleId[];
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

type SidePair = [number, number];

/** The three joints (per side) whose angle each joint id reports; `lean` is computed separately. */
const JOINT_TRIPLES: Record<Exclude<JointAngleId, 'lean'>, [SidePair, SidePair, SidePair]> = {
  hip: [SHOULDER, HIP, KNEE],
  shoulder: [ELBOW, SHOULDER, HIP],
  elbow: [SHOULDER, ELBOW, WRIST],
  knee: [HIP, KNEE, ANKLE],
};

/** How far the shoulders sit past the hands: the wrist–shoulder line's angle from vertical. */
function leanAngle(pose: Pose, side: PoseSide): JointAngle {
  const wrist = pick(pose, side, ...WRIST);
  const shoulder = pick(pose, side, ...SHOULDER);
  const up = { x: wrist.x, y: wrist.y - Math.hypot(shoulder.x - wrist.x, shoulder.y - wrist.y), score: wrist.score };
  return { id: 'lean', value: jointAngle(shoulder, wrist, up), a: shoulder, vertex: wrist, c: up };
}

/** The requested joint angles on one side of the body, in the order asked for. */
export function sideJoints(pose: Pose, side: PoseSide, ids: readonly JointAngleId[]): JointAngle[] {
  return ids.map((id) => {
    if (id === 'lean') return leanAngle(pose, side);
    const { a, vertex, c, value } = triple(pose, side, ...JOINT_TRIPLES[id]);
    return { id, value, a, vertex, c };
  });
}

/** A position's core measurement, plus the side it was read from so joint angles match it. */
type Core = Omit<PoseMeasurement, 'joints'> & { side: PoseSide };

function position(
  definition: Omit<PositionDefinition, 'measure'> & { core: (pose: Pose, side: PoseSide | null) => Core },
): PositionDefinition {
  const { core, ...rest } = definition;
  return {
    ...rest,
    measure: (pose, side) => {
      const { side: measuredSide, ...result } = core(pose, side);
      return { ...result, joints: sideJoints(pose, measuredSide, definition.joints) };
    },
  };
}

/** Angle between the two legs, measured at the centre of the hips (straight line = 180°). */
function legSpread(pose: Pose, side: PoseSide | null): Core {
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
    side: side ?? clearerSide(pose, [HIP, KNEE, ANKLE]),
  };
}

function hipFold(pose: Pose): Core {
  const side = clearerSide(pose, [SHOULDER, HIP, KNEE]);
  const fold = triple(pose, side, SHOULDER, HIP, KNEE);
  const knee = triple(pose, side, HIP, KNEE, ANKLE);
  return { value: fold.value, angle: fold, confidence: fold.confidence, warning: knee.value < 160 ? 'kneesBent' : undefined, side };
}

/**
 * Angle between the `from`→`to` line and the horizontal, whichever way the body faces. With
 * `ignoreAbove`, a `to` higher than `from` counts as level (0°). The angle is drawn against a
 * horizontal reference point at `from`.
 */
function tiltFromHorizontal(from: Keypoint, to: Keypoint, ignoreAbove = false): Pick<PoseMeasurement, 'value' | 'angle'> {
  const dx = to.x - from.x;
  // Image y grows downwards, so a positive angle means `to` sits below `from`.
  const signed = (Math.atan2(to.y - from.y, Math.abs(dx)) * 180) / Math.PI;
  const level = { x: from.x + (dx >= 0 ? 1 : -1) * Math.hypot(dx, to.y - from.y), y: from.y, score: from.score };
  return { value: ignoreAbove ? Math.max(0, signed) : Math.abs(signed), angle: { a: to, vertex: from, c: level } };
}

/** Straight-arm skills are filmed side-on: measure the clearer side and check the arms are locked. */
function straightArm(pose: Pose, measure: (side: PoseSide) => Omit<Core, 'side' | 'warning'>): Core {
  const side = clearerSide(pose, [WRIST, SHOULDER, HIP]);
  const elbow = triple(pose, side, SHOULDER, ELBOW, WRIST);
  return { ...measure(side), warning: elbow.value < 160 ? 'elbowsBent' : undefined, side };
}

/** How far the shoulder–hip line tilts from horizontal. */
function backAngle(pose: Pose, side: PoseSide, ignoreAbove: boolean) {
  const shoulder = pick(pose, side, ...SHOULDER);
  const hip = pick(pose, side, ...HIP);
  return { ...tiltFromHorizontal(shoulder, hip, ignoreAbove), confidence: (shoulder.score + hip.score) / 2 };
}

/** Total bend away from a horizontal shoulder–hip–ankle line: body tilt plus hip pike or sag. */
function bodyLine(pose: Pose, side: PoseSide) {
  const shoulder = pick(pose, side, ...SHOULDER);
  const ankle = pick(pose, side, ...ANKLE);
  const hip = triple(pose, side, SHOULDER, HIP, ANKLE);
  const tilt = tiltFromHorizontal(shoulder, ankle);
  return { value: tilt.value + (180 - hip.value), angle: tilt.angle, confidence: (shoulder.score + ankle.score + hip.vertex.score) / 3 };
}

const LIMBS: JointAngleId[] = ['hip', 'shoulder', 'elbow', 'knee'];
const SUPPORT: JointAngleId[] = ['hip', 'shoulder', 'elbow', 'knee', 'lean'];

export const POSITIONS: PositionDefinition[] = [
  position({ id: 'front_split', group: 'splits', sideAware: true, better: 'higher', thresholds: [120, 140, 160, 175], joints: ['hip', 'knee'], defaultJoints: [], core: legSpread }),
  position({ id: 'middle_split', group: 'splits', sideAware: false, better: 'higher', thresholds: [110, 130, 150, 170], joints: ['hip', 'knee'], defaultJoints: [], core: legSpread }),
  position({ id: 'pike', group: 'folds', sideAware: false, better: 'lower', thresholds: [110, 90, 70, 50], joints: ['knee', 'shoulder', 'elbow'], defaultJoints: [], core: hipFold }),
  position({ id: 'pancake', group: 'folds', sideAware: false, better: 'lower', thresholds: [120, 100, 80, 60], joints: ['knee', 'shoulder', 'elbow'], defaultJoints: [], core: hipFold }),
  position({
    id: 'bridge', group: 'shoulders', sideAware: false, better: 'higher', thresholds: [120, 140, 155, 170], joints: ['hip', 'elbow', 'knee'], defaultJoints: [],
    core: (pose) => {
      const side = clearerSide(pose, [WRIST, SHOULDER, HIP]);
      const opening = triple(pose, side, WRIST, SHOULDER, HIP);
      const elbow = triple(pose, side, SHOULDER, ELBOW, WRIST);
      return { value: opening.value, angle: opening, confidence: opening.confidence, warning: elbow.value < 160 ? 'elbowsBent' : undefined, side };
    },
  }),
  position({
    id: 'shoulder_flexion', group: 'shoulders', sideAware: true, better: 'higher', thresholds: [140, 155, 165, 175], joints: ['elbow', 'hip'], defaultJoints: [],
    core: (pose, side) => {
      const measured = side ?? clearerSide(pose, [HIP, SHOULDER, ELBOW]);
      const flexion = triple(pose, measured, HIP, SHOULDER, ELBOW);
      return { value: flexion.value, angle: flexion, confidence: flexion.confidence, side: measured };
    },
  }),
  position({
    id: 'deep_squat', group: 'folds', sideAware: false, better: 'lower', thresholds: [110, 90, 70, 50], joints: ['hip', 'shoulder'], defaultJoints: [],
    core: (pose) => {
      const side = clearerSide(pose, [HIP, KNEE, ANKLE]);
      const knee = triple(pose, side, HIP, KNEE, ANKLE);
      return { value: knee.value, angle: knee, confidence: knee.confidence, side };
    },
  }),
  position({
    id: 'handstand_line', group: 'balance', sideAware: false, better: 'lower', thresholds: [40, 30, 20, 10], joints: LIMBS, defaultJoints: [],
    core: (pose) => {
      const side = clearerSide(pose, [WRIST, SHOULDER, HIP, ANKLE]);
      const shoulder = triple(pose, side, WRIST, SHOULDER, HIP);
      const hip = triple(pose, side, SHOULDER, HIP, ANKLE);
      // Total bend away from a straight wrist–shoulder–hip–ankle line.
      const deviation = (180 - shoulder.value) + (180 - hip.value);
      return { value: deviation, angle: hip, confidence: (shoulder.confidence + hip.confidence) / 2, side };
    },
  }),
  // Back angle: 0° when the hips are level with (or above) the shoulders.
  position({
    id: 'tuck_planche', group: 'planche', sideAware: false, better: 'lower', thresholds: [40, 30, 20, 10], joints: SUPPORT, defaultJoints: SUPPORT,
    core: (pose) => straightArm(pose, (side) => backAngle(pose, side, true)),
  }),
  position({
    id: 'full_planche', group: 'planche', sideAware: false, better: 'lower', thresholds: [40, 30, 20, 10], joints: SUPPORT, defaultJoints: SUPPORT,
    core: (pose) => straightArm(pose, (side) => bodyLine(pose, side)),
  }),
  // Lean: how far the shoulders travel past the hands, read at the top with locked arms.
  position({
    id: 'pseudo_planche_pushup', group: 'planche', sideAware: false, better: 'higher', thresholds: [15, 25, 35, 45],
    joints: ['elbow', 'shoulder', 'hip', 'knee'], defaultJoints: ['elbow', 'hip'],
    core: (pose) => straightArm(pose, (side) => {
      const { a, vertex, c, value } = leanAngle(pose, side);
      return { value, angle: { a, vertex, c }, confidence: (a.score + vertex.score) / 2 };
    }),
  }),
  // A tucked lever wants a flat back: hips neither above nor below the shoulders.
  position({
    id: 'tuck_front_lever', group: 'levers', sideAware: false, better: 'lower', thresholds: [40, 30, 20, 10], joints: LIMBS, defaultJoints: LIMBS,
    core: (pose) => straightArm(pose, (side) => backAngle(pose, side, false)),
  }),
  position({
    id: 'front_lever', group: 'levers', sideAware: false, better: 'lower', thresholds: [40, 30, 20, 10], joints: LIMBS, defaultJoints: LIMBS,
    core: (pose) => straightArm(pose, (side) => bodyLine(pose, side)),
  }),
  position({
    id: 'back_lever', group: 'levers', sideAware: false, better: 'lower', thresholds: [40, 30, 20, 10], joints: LIMBS, defaultJoints: LIMBS,
    core: (pose) => straightArm(pose, (side) => bodyLine(pose, side)),
  }),
  // Leg angle below horizontal; legs above horizontal (a V-sit) count as level.
  position({
    id: 'l_sit', group: 'balance', sideAware: false, better: 'lower', thresholds: [40, 25, 15, 5],
    joints: ['hip', 'knee', 'elbow', 'shoulder'], defaultJoints: ['hip', 'knee'],
    core: (pose) => {
      const side = clearerSide(pose, [HIP, KNEE, ANKLE]);
      const hip = pick(pose, side, ...HIP);
      const ankle = pick(pose, side, ...ANKLE);
      const knee = triple(pose, side, HIP, KNEE, ANKLE);
      const elbow = triple(pose, side, SHOULDER, ELBOW, WRIST);
      const warning = knee.value < 160 ? 'kneesBent' : elbow.value < 160 ? 'elbowsBent' : undefined;
      return { ...tiltFromHorizontal(hip, ankle, true), confidence: (hip.score + ankle.score) / 2, warning, side };
    },
  }),
];

/** Joint ids to show for a position: the user's saved choice, limited to what the position offers. */
export function selectedJoints(position: PositionDefinition, saved: readonly string[] | null): JointAngleId[] {
  if (saved === null) return position.defaultJoints;
  return position.joints.filter((id) => saved.includes(id));
}

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
