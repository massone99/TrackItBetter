import { Image } from 'react-native';
import type { JointAngleId, Keypoint, Pose } from '../../domain/pose';
import type { OverlaySettings } from './overlay/model';

// Web preview: shows the image without the interactive skeleton (Skia and the model are native-only).
export function PoseCanvas({ uri, imageWidth, imageHeight, maxWidth, maxHeight = 520 }: {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  pose: Pose;
  highlight?: { a: Keypoint; vertex: Keypoint; c: Keypoint } | null;
  label?: string | null;
  angles?: { id: JointAngleId; a: Keypoint; vertex: Keypoint; c: Keypoint; name: string; value: string }[];
  settings?: OverlaySettings;
  focused?: JointAngleId | null;
  maxWidth: number;
  maxHeight?: number;
  editable?: boolean;
  onDragStart?: () => void;
  onChange?: (pose: Pose) => void;
}) {
  const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
  return <Image source={{ uri }} style={{ width: imageWidth * scale, height: imageHeight * scale, alignSelf: 'center' }} />;
}
