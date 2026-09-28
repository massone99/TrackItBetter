import { Circle, Group, Image as SkiaImage, Line, Path, Skia, vec, type SkImage, type SkPoint } from '@shopify/react-native-skia';
import type { Keypoint, Pose } from '../../../domain/pose';
import { LOW_CONFIDENCE } from '../../../domain/pose';

const ARC_RADIUS = 14;
/** Near-straight angles get no arc: the straight line already shows them and a half circle is noise. */
const ARC_MAX_DEGREES = 165;
export const SHADOW = 'rgba(0,0,0,0.55)';

/** Arc at `vertex` sweeping the smaller way from ray `a` to ray `c`, or null for a near-straight angle. */
function arcPath(a: SkPoint, vertex: SkPoint, c: SkPoint) {
  const start = (Math.atan2(a.y - vertex.y, a.x - vertex.x) * 180) / Math.PI;
  const end = (Math.atan2(c.y - vertex.y, c.x - vertex.x) * 180) / Math.PI;
  const sweep = ((end - start + 540) % 360) - 180;
  if (Math.abs(sweep) > ARC_MAX_DEGREES) return null;
  const builder = Skia.PathBuilder.Make();
  builder.addArc(Skia.XYWHRect(vertex.x - ARC_RADIUS, vertex.y - ARC_RADIUS, ARC_RADIUS * 2, ARC_RADIUS * 2), start, sweep);
  return builder.detach();
}

/** A line drawn over a dark shadow so it stands out on light and dark parts of the photo. */
function OutlinedLine({ p1, p2, color, width }: { p1: SkPoint; p2: SkPoint; color: string; width: number }) {
  return (
    <>
      <Line p1={p1} p2={p2} color={SHADOW} strokeWidth={width + 3} strokeCap="round" />
      <Line p1={p1} p2={p2} color={color} strokeWidth={width} strokeCap="round" />
    </>
  );
}

/** Thin, translucent limbs that give context without competing with the measured angles. */
export function SkeletonLayer({ pose, segments, toView }: { pose: Pose; segments: [number, number][]; toView: (point: Keypoint) => SkPoint }) {
  return (
    <>
      {segments.map(([from, to]) => (
        <Line key={`${from}-${to}`} p1={toView(pose[from])} p2={toView(pose[to])} color="rgba(255,255,255,0.6)" strokeWidth={2} strokeCap="round" />
      ))}
    </>
  );
}

/** One angle: its two rays and, unless nearly straight, an arc at the vertex. */
export function AngleLayer({ a, vertex, c, color, width, arc = true }: { a: SkPoint; vertex: SkPoint; c: SkPoint; color: string; width: number; arc?: boolean }) {
  const path = arc ? arcPath(a, vertex, c) : null;
  return (
    <>
      <OutlinedLine p1={a} p2={vertex} color={color} width={width} />
      <OutlinedLine p1={vertex} p2={c} color={color} width={width} />
      {path ? (
        <>
          <Path path={path} style="stroke" color={SHADOW} strokeWidth={width + 3} />
          <Path path={path} style="stroke" color={color} strokeWidth={width} />
        </>
      ) : null}
    </>
  );
}

/** Joint dots; uncertain joints are hollow, the one being dragged is enlarged. */
export function JointHandles({ pose, indices, dragging, toView, accent, active }: {
  pose: Pose;
  indices: number[];
  dragging: number | null;
  toView: (point: Keypoint) => SkPoint;
  accent: string;
  active: string;
}) {
  return (
    <>
      {indices.map((index) => {
        const point = pose[index];
        const confident = point.score >= LOW_CONFIDENCE;
        const isActive = dragging === index;
        return (
          <Circle
            key={index}
            c={toView(point)}
            r={isActive ? 10 : 5.5}
            color={isActive ? active : confident ? accent : 'rgba(255,255,255,0.9)'}
            style={confident || isActive ? 'fill' : 'stroke'}
            strokeWidth={2.5}
          />
        );
      })}
    </>
  );
}

const LOUPE_RADIUS = 58;
const LOUPE_ZOOM = 2.5;

/**
 * Magnified view around the joint being dragged, shown in the top corner away from the finger so
 * the joint can be placed precisely.
 */
export function Loupe({ image, width, height, point, color }: { image: SkImage; width: number; height: number; point: SkPoint; color: string }) {
  const center = vec(point.x < width / 2 ? width - LOUPE_RADIUS - 10 : LOUPE_RADIUS + 10, LOUPE_RADIUS + 10);
  const clip = Skia.RRectXY(Skia.XYWHRect(center.x - LOUPE_RADIUS, center.y - LOUPE_RADIUS, LOUPE_RADIUS * 2, LOUPE_RADIUS * 2), LOUPE_RADIUS, LOUPE_RADIUS);
  return (
    <>
      <Group clip={clip}>
        <Group transform={[{ translateX: center.x - point.x * LOUPE_ZOOM }, { translateY: center.y - point.y * LOUPE_ZOOM }, { scale: LOUPE_ZOOM }]}>
          <SkiaImage image={image} x={0} y={0} width={width} height={height} fit="fill" />
        </Group>
        <Line p1={vec(center.x - 12, center.y)} p2={vec(center.x + 12, center.y)} color={color} strokeWidth={2} />
        <Line p1={vec(center.x, center.y - 12)} p2={vec(center.x, center.y + 12)} color={color} strokeWidth={2} />
      </Group>
      <Circle c={center} r={LOUPE_RADIUS} style="stroke" color={SHADOW} strokeWidth={5} />
      <Circle c={center} r={LOUPE_RADIUS} style="stroke" color="#FFFFFF" strokeWidth={2.5} />
    </>
  );
}
