import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';

export interface PoseImage {
  uri: string;
  width: number;
  height: number;
}

const MAX_EDGE = 1280;

/**
 * Re-encodes a picked image as an upright JPEG (camera photos often carry a rotation flag the
 * model would ignore) and caps its size so analysis and storage stay light.
 */
export async function normalizeImage(uri: string, width: number, height: number): Promise<PoseImage> {
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_EDGE) {
    context.resize(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

export interface VideoFrame extends PoseImage {
  timeMs: number;
}

/** Evenly spaced frames across a clip, skipping the very first and last moments. */
export async function extractFrames(videoUri: string, durationMs: number, count = 12): Promise<VideoFrame[]> {
  const duration = Math.max(1000, durationMs);
  const frames: VideoFrame[] = [];
  let lastFailure: unknown = null;
  for (let index = 0; index < count; index += 1) {
    const timeMs = Math.round(duration * ((index + 0.5) / count));
    try {
      const thumbnail = await VideoThumbnails.getThumbnailAsync(videoUri, { time: timeMs, quality: 0.85 });
      frames.push({ uri: thumbnail.uri, width: thumbnail.width, height: thumbnail.height, timeMs });
    } catch (failure) {
      // A frame that cannot be decoded is skipped; the rest of the strip is still usable.
      lastFailure = failure;
    }
  }
  if (frames.length === 0) {
    const detail = lastFailure instanceof Error ? lastFailure.message : String(lastFailure);
    throw new Error(`video frames: ${detail}`);
  }
  return frames;
}
