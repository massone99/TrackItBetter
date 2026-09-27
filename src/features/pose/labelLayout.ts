export interface Point {
  x: number;
  y: number;
}

/** An angle drawn on the canvas, in view coordinates, and the size of its label. */
export interface LabelRequest {
  a: Point;
  vertex: Point;
  c: Point;
  width: number;
  height: number;
}

export interface LabelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Area labels may use; it can reach past the photo so labels have room around small images. */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Label sizes from their text, matching the font sizes in PoseCanvas. Boxes are sized up front so
 * labels can be laid out without measuring them first.
 */
export function angleLabelSize(name: string, value: string, strong: boolean): { width: number; height: number } {
  const factor = strong ? 1.2 : 1;
  return { width: Math.ceil((20 + name.length * 7.2 + value.length * 9.5) * factor), height: strong ? 32 : 27 };
}

export function mainLabelSize(label: string): { width: number; height: number } {
  return { width: 18 + label.length * 12, height: 34 };
}

/** Photos shorter than this get a band above and below them for labels, so labels need not cover the body. */
const SHORT_PHOTO = 320;
const BAND = 44;

/** Height of the label band above and below a photo shown `height` tall. */
export function labelBand(height: number, hasLabels: boolean): number {
  return hasLabels && height < SHORT_PHOTO ? BAND : 0;
}

/** Gap between a joint and the centre of its label. */
const OFFSET = 34;
const MARGIN = 4;

function unit(x: number, y: number): Point {
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
}

/** Direction pointing out of the angle at `vertex`, away from both of its rays. */
export function outsideDirection(a: Point, vertex: Point, c: Point): Point {
  const u1 = unit(a.x - vertex.x, a.y - vertex.y);
  const u2 = unit(c.x - vertex.x, c.y - vertex.y);
  const out = unit(-(u1.x + u2.x), -(u1.y + u2.y));
  // A straight (180°) angle has no outside: use the perpendicular that points up.
  if (out.x === 0 && out.y === 0) return u1.x === 0 && u1.y === 0 ? { x: 0, y: -1 } : unit(u1.y, -u1.x).y <= 0 ? unit(u1.y, -u1.x) : unit(-u1.y, u1.x);
  return out;
}

/** Overlapping area of two boxes, counting the margin kept between labels. */
function overlapArea(box: LabelBox, other: LabelBox): number {
  const x = Math.min(box.left + box.width, other.left + other.width) - Math.max(box.left, other.left) + MARGIN;
  const y = Math.min(box.top + box.height, other.top + other.height) - Math.max(box.top, other.top) + MARGIN;
  return x > 0 && y > 0 ? x * y : 0;
}

function clamp(box: LabelBox, bounds: Bounds): LabelBox {
  return {
    ...box,
    left: Math.min(bounds.right - box.width, Math.max(bounds.left, box.left)),
    top: Math.min(bounds.bottom - box.height, Math.max(bounds.top, box.top)),
  };
}

/** Points every `step` along each segment, so a drawn skeleton can be treated as an obstacle. */
export function sampleSegments(segments: [Point, Point][], step = 8): Point[] {
  return segments.flatMap(([from, to]) => {
    const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step));
    return Array.from({ length: count + 1 }, (_, index) => ({
      x: from.x + ((to.x - from.x) * index) / count,
      y: from.y + ((to.y - from.y) * index) / count,
    }));
  });
}

// Candidate cost: covering another label is far worse than covering the body, and both are worse
// than sitting a little further from the joint.
const LABEL_COST = 100;
const BODY_COST = 10;
const DISTANCE_COST = 0.1;

/**
 * Places each label near its joint, preferring the outside of its angle. Candidates further out, to
 * the sides and inside the angle are compared, and the one that covers the fewest earlier labels
 * (`reserved` holds boxes already taken), then the fewest `obstacles` (points on the drawn body),
 * wins.
 */
export function placeAngleLabels(requests: LabelRequest[], bounds: Bounds, reserved: LabelBox[] = [], obstacles: Point[] = []): LabelBox[] {
  const placed: LabelBox[] = [...reserved];
  return requests.map((request) => {
    const out = outsideDirection(request.a, request.vertex, request.c);
    const side = { x: out.y, y: -out.x };
    const directions = [
      out,
      unit(out.x + side.x, out.y + side.y), unit(out.x - side.x, out.y - side.y),
      side, { x: -side.x, y: -side.y },
      unit(-out.x + side.x, -out.y + side.y), unit(-out.x - side.x, -out.y - side.y),
      { x: -out.x, y: -out.y },
    ];
    const at = (direction: Point, distance: number) => clamp({
      left: request.vertex.x + direction.x * distance - request.width / 2,
      top: request.vertex.y + direction.y * distance - request.height / 2,
      width: request.width,
      height: request.height,
    }, bounds);
    let box = at(out, OFFSET);
    let least = Infinity;
    for (const direction of directions) {
      for (let step = 0; step < 8; step += 1) {
        const candidate = at(direction, OFFSET + step * request.height * 0.6);
        const labels = placed.reduce((sum, other) => sum + overlapArea(candidate, other), 0);
        const body = obstacles.filter((point) => point.x >= candidate.left && point.x <= candidate.left + candidate.width
          && point.y >= candidate.top && point.y <= candidate.top + candidate.height).length;
        const centre = { x: candidate.left + candidate.width / 2, y: candidate.top + candidate.height / 2 };
        const cost = labels * LABEL_COST + body * BODY_COST + Math.hypot(centre.x - request.vertex.x, centre.y - request.vertex.y) * DISTANCE_COST;
        if (cost < least) { least = cost; box = candidate; }
      }
    }
    placed.push(box);
    return box;
  });
}
