# Models

`movenet_thunder.tflite` — MoveNet SinglePose Thunder (float16, v4) by Google, from TensorFlow Hub
(`google/lite-model/movenet/singlepose/thunder/tflite/float16/4`). Licensed under the Apache License 2.0.
Input: one 256×256 RGB image. Output: 17 COCO keypoints as (y, x, score), normalized to the input.
It runs fully on-device; images never leave the phone.
