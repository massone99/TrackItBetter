import { Canvas, Circle, Image as SkiaImage, Line, useImage, vec } from '@shopify/react-native-skia';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LOW_CONFIDENCE, SKELETON, type Keypoint, type Pose } from '../../domain/pose';
import { Text } from '../../shared/components/ui';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { fonts } from '../../shared/theme/typography';

const TOUCH_RADIUS = 36;

/**
 * Photo with the detected skeleton drawn on top. Joints can be dragged to correct the detection;
 * the measured angle is highlighted and labelled with its value.
 */
export function PoseCanvas({ uri, imageWidth, imageHeight, pose, highlight, label, maxWidth, maxHeight = 520, editable = true, onChange }: {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  pose: Pose;
  highlight?: { a: Keypoint; vertex: Keypoint; c: Keypoint } | null;
  label?: string | null;
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

  const labelPoint = highlight ? toView(highlight.vertex) : null;

  return (
    <GestureDetector gesture={pan}>
      <View style={{ width, height, alignSelf: 'center' }}>
        <Canvas style={{ width, height }}>
          {image ? <SkiaImage image={image} x={0} y={0} width={width} height={height} fit="fill" /> : null}
          {SKELETON.map(([from, to]) => (
            <Line key={`${from}-${to}`} p1={toView(pose[from])} p2={toView(pose[to])} color="rgba(255,255,255,0.85)" strokeWidth={3} />
          ))}
          {highlight ? (
            <>
              <Line p1={toView(highlight.a)} p2={toView(highlight.vertex)} color={palette.record} strokeWidth={5} />
              <Line p1={toView(highlight.vertex)} p2={toView(highlight.c)} color={palette.record} strokeWidth={5} />
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
        {label && labelPoint ? (
          <View pointerEvents="none" style={[styles.label, { left: Math.min(width - 72, Math.max(0, labelPoint.x + 10)), top: Math.max(0, labelPoint.y - 34), backgroundColor: palette.record }]}>
            <Text style={styles.labelText}>{label}</Text>
          </View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  label: { position: 'absolute', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  labelText: { fontFamily: fonts.display, fontSize: 20, color: '#FFFFFF' },
});
