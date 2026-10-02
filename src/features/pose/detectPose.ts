import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { Asset } from 'expo-asset';
import { loadTensorflowModel, type TfliteModel } from 'react-native-fast-tflite';
import type { Pose } from '../../domain/pose';

const INPUT_SIZE = 256;
let modelPromise: Promise<TfliteModel> | null = null;

/**
 * Loads MoveNet Thunder once; later calls reuse it. The model is copied to a local file first:
 * fast-tflite only reads URLs, and in a release build a bundled asset is an Android resource name,
 * not a URL.
 */
function getModel(): Promise<TfliteModel> {
  modelPromise ??= (async () => {
    // Bundled assets can only be referenced through require().
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const [asset] = await Asset.loadAsync(require('../../../assets/models/movenet_thunder.tflite'));
    if (!asset.localUri) throw new Error('Could not load the pose model');
    // The native loader reads a URL: a bare path from the asset cache needs its file scheme.
    const url = /^[a-z][a-z0-9+.-]*:/i.test(asset.localUri) ? asset.localUri : `file://${asset.localUri}`;
    return loadTensorflowModel({ url }, []);
  })().catch((error: unknown) => {
    modelPromise = null;
    throw error;
  });
  return modelPromise;
}

export const poseDetectionAvailable = true;

/** Runs one step of the analysis; a failure names the step, so the message on screen says where it broke. */
async function step<T>(name: string, run: () => Promise<T> | T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[pose] ${name} failed:`, error);
    throw new Error(`${name}: ${message}`);
  }
}

/**
 * Detects the 17 body keypoints in an image file on-device. The image is letterboxed into the
 * model's 256×256 input so proportions are kept, and keypoints are mapped back to image pixels.
 */
export async function detectPose(uri: string): Promise<{ pose: Pose; width: number; height: number }> {
  const model = await step('model', getModel);
  const data = await step('read image', () => Skia.Data.fromURI(uri));
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('decode image: the file could not be decoded');
  const width = image.width();
  const height = image.height();

  const scale = INPUT_SIZE / Math.max(width, height);
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  const offsetX = (INPUT_SIZE - drawnWidth) / 2;
  const offsetY = (INPUT_SIZE - drawnHeight) / 2;

  const surface = Skia.Surface.Make(INPUT_SIZE, INPUT_SIZE);
  if (!surface) throw new Error('prepare image: no drawing surface');
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
  if (!pixels) throw new Error('prepare image: pixels could not be read');

  const input = toModelInput(pixels, model.inputs[0]?.dataType ?? 'uint8');
  const [output] = await step('run model', () => model.run([input]));
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
