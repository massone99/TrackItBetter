import { Canvas, Circle, Image as SkiaImage, Line, Path, Skia, useImage, vec, type SkPoint } from '@shopify/react-native-skia';
import { Fragment, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LOW_CONFIDENCE, SKELETON, type Keypoint, type Pose } from '../../domain/pose';
import { Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { angleLabelSize, labelBand, mainLabelSize, placeAngleLabels, sampleSegments, type LabelRequest } from './labelLayout';

const TOUCH_RADIUS = 36;
const ARC_RADIUS = 14;
/** Near-straight angles get no arc: the straight line already shows them and a half circle is noise. */
const ARC_MAX_DEGREES = 165;
/** Overlay colours are fixed, not themed: they sit on a photo, whatever the app theme. */
const JOINT_COLOR = '#4F7DFF';
const SHADOW = 'rgba(0,0,0,0.55)';
const LABEL_BACKGROUND = 'rgba(12,16,26,0.86)';

/** A secondary joint angle drawn over the photo; the first one is drawn stronger. */
export interface CanvasAngle {
  a: Keypoint;
  vertex: Keypoint;
  c: Keypoint;
  /** Short joint name shown before the value, e.g. "Hip". */
  name: string;
  /** Formatted value, e.g. "38°". */
  value: string;
}

/** Arc at `vertex` sweeping the smaller way from ray `a` to ray `c`, or null for a near-straight angle. */
function arcPath(a: SkPoint, vertex: SkPoint, c: SkPoint) {
  const start = (Math.atan2(a.y - vertex.y, a.x - vertex.x) * 180) / Math.PI;
  const end = (Math.atan2(c.y - vertex.y, c.x - vertex.x) * 180) / Math.PI;
  const sweep = ((end - start + 540) % 360) - 180;
  if (Math.abs(sweep) > ARC_MAX_DEGREES) return null;
  const path = Skia.Path.Make();
  path.addArc(Skia.XYWHRect(vertex.x - ARC_RADIUS, vertex.y - ARC_RADIUS, ARC_RADIUS * 2, ARC_RADIUS * 2), start, sweep);
  return path;
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

/**
 * Photo with the detected skeleton drawn on top. Joints can be dragged to correct the detection;
 * the measured angle is highlighted and labelled with its value, and any other joint angles are
 * drawn with an arc and a named label placed outside the angle. Short photos get a band above and
 * below so labels need not cover the body.
 */
export function PoseCanvas({ uri, imageWidth, imageHeight, pose, highlight, label, angles = [], maxWidth, maxHeight = 520, editable = true, onChange }: {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  pose: Pose;
  highlight?: { a: Keypoint; vertex: Keypoint; c: Keypoint } | null;
  label?: string | null;
  angles?: CanvasAngle[];
  maxWidth: number;
  maxHeight?: number;
  editable?: boolean;
  onChange?: (pose: Pose) => void;
}) {
  const { palette } = useTheme();
  const image = useImage(uri);
  const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const [dragging, setDragging] = useState<number | null>(null);

  const toView = (point: Keypoint) => vec(point.x * scale, point.y * scale);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(editable)
    .minDistance(0)
    .onBegin((event) => {
      let nearest: number | null = null;
      let best = TOUCH_RADIUS;
      pose.forEach((point, index) => {
        const distance = Math.hypot(point.x * scale - event.x, point.y * scale - event.y);
        if (distance < best) { best = distance; nearest = index; }
      });
      setDragging(nearest);
    })
    .onUpdate((event) => {
      // The gesture is rebuilt on every render, so `dragging` is the current joint here.
      const index = dragging;
      if (index === null) return;
      const x = Math.min(width, Math.max(0, event.x)) / scale;
      const y = Math.min(height, Math.max(0, event.y)) / scale;
      onChange?.(pose.map((point, position) => (position === index ? { x, y, score: 1 } : point)));
    })
    .onFinalize(() => {
      setDragging(null);
    });

  // The measured angle's label is placed first so the joint labels keep clear of it.
  const requests: LabelRequest[] = [];
  if (highlight && label) {
    requests.push({ a: toView(highlight.a), vertex: toView(highlight.vertex), c: toView(highlight.c), ...mainLabelSize(label) });
  }
  angles.forEach((angle, index) => {
    requests.push({ a: toView(angle.a), vertex: toView(angle.vertex), c: toView(angle.c), ...angleLabelSize(angle.name, angle.value, index === 0) });
  });
  const band = labelBand(height, requests.length > 1);
  // Labels keep off the drawn body where they can: skeleton, measured angle and joint angle lines.
  const drawn = [
    ...SKELETON.map(([from, to]) => [toView(pose[from]), toView(pose[to])] as [SkPoint, SkPoint]),
    ...requests.flatMap((request) => [[request.a, request.vertex], [request.vertex, request.c]] as [SkPoint, SkPoint][]),
  ];
  const boxes = placeAngleLabels(requests, { left: 0, top: -band, right: width, bottom: height + band }, [], sampleSegments(drawn));
  // Only keep as much of the band as the labels actually use.
  const bandTop = Math.max(0, ...boxes.map((box) => -box.top));
  const bandBottom = Math.max(0, ...boxes.map((box) => box.top + box.height - height));
  const mainBox = highlight && label ? boxes[0] : null;
  const angleBoxes = highlight && label ? boxes.slice(1) : boxes;

  return (
    <View style={{ width, height: height + bandTop + bandBottom, alignSelf: 'center' }}>
      <GestureDetector gesture={pan}>
        <Canvas style={{ width, height, marginTop: bandTop }}>
          {image ? <SkiaImage image={image} x={0} y={0} width={width} height={height} fit="fill" /> : null}
          {SKELETON.map(([from, to]) => (
            <Line key={`${from}-${to}`} p1={toView(pose[from])} p2={toView(pose[to])} color="rgba(255,255,255,0.85)" strokeWidth={3} />
          ))}
          {angles.map((angle, index) => {
            const strokeWidth = index === 0 ? 5 : 3.5;
            const [a, vertex, c] = [toView(angle.a), toView(angle.vertex), toView(angle.c)];
            const arc = arcPath(a, vertex, c);
            return (
              <Fragment key={`angle-${index}`}>
                <OutlinedLine p1={a} p2={vertex} color={JOINT_COLOR} width={strokeWidth} />
                <OutlinedLine p1={vertex} p2={c} color={JOINT_COLOR} width={strokeWidth} />
                {arc ? (
                  <>
                    <Path path={arc} style="stroke" color={SHADOW} strokeWidth={strokeWidth + 3} />
                    <Path path={arc} style="stroke" color={JOINT_COLOR} strokeWidth={strokeWidth} />
                  </>
                ) : null}
              </Fragment>
            );
          })}
          {highlight ? (
            <>
              <OutlinedLine p1={toView(highlight.a)} p2={toView(highlight.vertex)} color={palette.record} width={5} />
              <OutlinedLine p1={toView(highlight.vertex)} p2={toView(highlight.c)} color={palette.record} width={5} />
            </>
          ) : null}
          {pose.map((point, index) => {
            const center = toView(point);
            const confident = point.score >= LOW_CONFIDENCE;
            const active = dragging === index;
            return (
              <Circle
                key={index}
                c={center}
                r={active ? 11 : 6.5}
                color={active ? palette.record : confident ? palette.accent : 'rgba(255,255,255,0.9)'}
                style={confident || active ? 'fill' : 'stroke'}
                strokeWidth={2.5}
              />
            );
          })}
        </Canvas>
      </GestureDetector>
      {angleBoxes.map((box, index) => (
        <View key={`angle-label-${index}`} pointerEvents="none" style={[styles.box, { left: box.left, top: box.top + bandTop, width: box.width, height: box.height, borderColor: JOINT_COLOR }]}>
          <Text numberOfLines={1} style={[styles.name, index === 0 && styles.nameStrong]}>{angles[index].name} </Text>
          <Text numberOfLines={1} style={[styles.value, index === 0 && styles.valueStrong]}>{angles[index].value}</Text>
        </View>
      ))}
      {label && mainBox ? (
        <View pointerEvents="none" style={[styles.box, { left: mainBox.left, top: mainBox.top + bandTop, width: mainBox.width, height: mainBox.height, borderColor: palette.record }]}>
          <Text numberOfLines={1} style={styles.mainValue}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: LABEL_BACKGROUND,
  },
  name: { fontFamily: fonts.medium, fontSize: 13, color: '#D9E0EE' },
  nameStrong: { fontSize: 15, color: '#FFFFFF' },
  value: { fontFamily: fonts.display, fontSize: 17, color: '#FFFFFF' },
  valueStrong: { fontSize: 20 },
  mainValue: { fontFamily: fonts.display, fontSize: 22, color: '#FFFFFF' },
});
