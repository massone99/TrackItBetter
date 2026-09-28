import { Canvas, Image as SkiaImage, useImage, vec, type SkPoint } from '@shopify/react-native-skia';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { JointAngleId, Keypoint, Pose } from '../../domain/pose';
import { Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';
import { angleLabelSize, labelBand, mainLabelSize, placeAngleLabels, sampleSegments, type LabelRequest } from './labelLayout';
import { AngleLayer, JointHandles, Loupe, SkeletonLayer } from './overlay/layers';
import { DEFAULT_OVERLAY, handleIndices, JOINT_COLORS, skeletonSegments, visibleJoints, type OverlaySettings } from './overlay/model';

const TOUCH_RADIUS = 36;
const DRAG_DELAY_MS = 150;
const LABEL_BACKGROUND = 'rgba(12,16,26,0.86)';

/** A joint angle the canvas may draw; the overlay settings decide which ones actually appear. */
export interface CanvasAngle {
  id: JointAngleId;
  a: Keypoint;
  vertex: Keypoint;
  c: Keypoint;
  /** Short joint name shown before the value, e.g. "Hip". */
  name: string;
  /** Formatted value, e.g. "38°". */
  value: string;
}

/**
 * Photo with the detected pose drawn on top, in independent layers (skeleton, measured angle, joint
 * angles, joint dots, magnifier) controlled by `settings`. Joints can be dragged to correct the
 * detection; while dragging, a magnifier shows the area under the finger.
 */
export function PoseCanvas({
  uri, imageWidth, imageHeight, pose, highlight, label, angles = [], settings = DEFAULT_OVERLAY, focused = null,
  maxWidth, maxHeight = 520, editable = true, onDragStart, onChange,
}: {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  pose: Pose;
  highlight?: { a: Keypoint; vertex: Keypoint; c: Keypoint } | null;
  label?: string | null;
  angles?: CanvasAngle[];
  settings?: OverlaySettings;
  focused?: JointAngleId | null;
  maxWidth: number;
  maxHeight?: number;
  editable?: boolean;
  /** Called once when a drag starts, before the first change, e.g. to save an undo step. */
  onDragStart?: () => void;
  onChange?: (pose: Pose) => void;
}) {
  const { palette } = useTheme();
  const image = useImage(uri);
  const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const [dragging, setDragging] = useState<number | null>(null);

  const toView = (point: Keypoint): SkPoint => vec(point.x * scale, point.y * scale);
  const main = settings.mainAngle && highlight ? highlight : null;
  const shown = visibleJoints(angles, settings, focused);
  const drawnAngles = [...(main ? [main] : []), ...shown];
  const segments = skeletonSegments(pose, drawnAngles, settings.skeleton);
  // Dots stay on every chosen joint, even when its lines are hidden, so it can still be corrected.
  const handles = handleIndices(pose, [...(highlight ? [highlight] : []), ...angles], settings.skeleton);

  // A short press picks a joint up; a quick swipe over the photo still scrolls the page instead
  // of dragging whatever joint was under the finger.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(editable)
    .activateAfterLongPress(DRAG_DELAY_MS)
    .onStart((event) => {
      let nearest: number | null = null;
      let best = TOUCH_RADIUS;
      for (const index of handles) {
        const distance = Math.hypot(pose[index].x * scale - event.x, pose[index].y * scale - event.y);
        if (distance < best) { best = distance; nearest = index; }
      }
      if (nearest !== null) onDragStart?.();
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
  if (main && label) requests.push({ a: toView(main.a), vertex: toView(main.vertex), c: toView(main.c), ...mainLabelSize(label) });
  shown.forEach((angle) => {
    requests.push({ a: toView(angle.a), vertex: toView(angle.vertex), c: toView(angle.c), ...angleLabelSize(angle.name, angle.value, false) });
  });
  const band = labelBand(height, requests.length > 1);
  // Labels keep off the drawn body where they can: skeleton, measured angle and joint angle lines.
  const drawn = [
    ...segments.map(([from, to]) => [toView(pose[from]), toView(pose[to])] as [SkPoint, SkPoint]),
    ...requests.flatMap((request) => [[request.a, request.vertex], [request.vertex, request.c]] as [SkPoint, SkPoint][]),
  ];
  const boxes = placeAngleLabels(requests, { left: 0, top: -band, right: width, bottom: height + band }, [], sampleSegments(drawn));
  // Only keep as much of the band as the labels actually use.
  const bandTop = Math.max(0, ...boxes.map((box) => -box.top));
  const bandBottom = Math.max(0, ...boxes.map((box) => box.top + box.height - height));
  const mainBox = main && label ? boxes[0] : null;
  const angleBoxes = main && label ? boxes.slice(1) : boxes;
  const draggedPoint = dragging !== null ? toView(pose[dragging]) : null;

  return (
    <View style={{ width, height: height + bandTop + bandBottom, alignSelf: 'center' }}>
      <GestureDetector gesture={pan}>
        <Canvas style={{ width, height, marginTop: bandTop }}>
          {image ? <SkiaImage image={image} x={0} y={0} width={width} height={height} fit="fill" /> : null}
          <SkeletonLayer pose={pose} segments={segments} toView={toView} />
          {shown.map((angle) => (
            <AngleLayer key={angle.id} a={toView(angle.a)} vertex={toView(angle.vertex)} c={toView(angle.c)} color={JOINT_COLORS[angle.id]} width={4} />
          ))}
          {main ? <AngleLayer a={toView(main.a)} vertex={toView(main.vertex)} c={toView(main.c)} color={palette.record} width={5} arc={false} /> : null}
          <JointHandles pose={pose} indices={handles} dragging={dragging} toView={toView} accent={palette.accent} active={palette.record} />
          {image && draggedPoint ? <Loupe image={image} width={width} height={height} point={draggedPoint} color={palette.record} /> : null}
        </Canvas>
      </GestureDetector>
      {angleBoxes.map((box, index) => (
        <View key={`angle-label-${shown[index].id}`} pointerEvents="none" style={[styles.box, { left: box.left, top: box.top + bandTop, width: box.width, height: box.height, borderColor: JOINT_COLORS[shown[index].id] }]}>
          <Text numberOfLines={1} style={styles.name}>{shown[index].name} </Text>
          <Text numberOfLines={1} style={styles.value}>{shown[index].value}</Text>
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
  value: { fontFamily: fonts.display, fontSize: 17, color: '#FFFFFF' },
  mainValue: { fontFamily: fonts.display, fontSize: 22, color: '#FFFFFF' },
});
