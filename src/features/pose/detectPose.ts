import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { loadTensorflowModel, type TfliteModel } from 'react-native-fast-tflite';
import type { Pose } from '../../domain/pose';

const INPUT_SIZE = 256;
let modelPromise: Promise<TfliteModel> | null = null;

/** Loads MoveNet Thunder once; later calls reuse it. */
function getModel(): Promise<TfliteModel> {
  // Bundled assets can only be referenced through require().
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  modelPromise ??= loadTensorflowModel(require('../../../assets/models/movenet_thunder.tflite'), []).catch((error: unknown) => {
    modelPromise = null;
    throw error;
  });
  return modelPromise;
}

export const poseDetectionAvailable = true;

/**
 * Detects the 17 body keypoints in an image file on-device. The image is letterboxed into the
 * model's 256×256 input so proportions are kept, and keypoints are mapped back to image pixels.
 */
export async function detectPose(uri: string): Promise<{ pose: Pose; width: number; height: number }> {
  const [model, data] = await Promise.all([getModel(), Skia.Data.fromURI(uri)]);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('Could not decode the image');
  const width = image.width();
  const height = image.height();

  const scale = INPUT_SIZE / Math.max(width, height);
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  const offsetX = (INPUT_SIZE - drawnWidth) / 2;
  const offsetY = (INPUT_SIZE - drawnHeight) / 2;

  const surface = Skia.Surface.Make(INPUT_SIZE, INPUT_SIZE);
  if (!surface) throw new Error('Could not prepare the image for analysis');
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('black'));
  canvas.drawImageRect(image, Skia.XYWHRect(0, 0, width, height), Skia.XYWHRect(offsetX, offsetY, drawnWidth, drawnHeight), Skia.Paint());
  surface.flush();
  const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
    width: INPUT_SIZE,
    height: INPUT_SIZE,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!pixels) throw new Error('Could not read the image pixels');

  const input = toModelInput(pixels, model.inputs[0]?.dataType ?? 'uint8');
  const [output] = await model.run([input]);
  const values = new Float32Array(output);

  // Output layout [1, 1, 17, 3]: y, x, score, normalized to the 256×256 input.
  const pose: Pose = Array.from({ length: 17 }, (_, index) => {
    const y = values[index * 3] * INPUT_SIZE;
    const x = values[index * 3 + 1] * INPUT_SIZE;
    return { x: (x - offsetX) / scale, y: (y - offsetY) / scale, score: values[index * 3 + 2] };
  });
  return { pose, width, height };
}

/** RGBA pixels → RGB tensor in the input type the model expects. */
function toModelInput(rgba: Uint8Array | Float32Array, dataType: string): ArrayBuffer {
  const count = INPUT_SIZE * INPUT_SIZE;
  const target = dataType === 'float32' ? new Float32Array(count * 3) : dataType === 'int32' ? new Int32Array(count * 3) : new Uint8Array(count * 3);
  const factor = rgba instanceof Float32Array ? 255 : 1;
  for (let pixel = 0; pixel < count; pixel += 1) {
    target[pixel * 3] = rgba[pixel * 4] * factor;
    target[pixel * 3 + 1] = rgba[pixel * 4 + 1] * factor;
    target[pixel * 3 + 2] = rgba[pixel * 4 + 2] * factor;
  }
  return target.buffer as ArrayBuffer;
}
