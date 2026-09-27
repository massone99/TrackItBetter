import { outsideDirection, placeAngleLabels, sampleSegments, type LabelBox } from '../labelLayout';

const overlap = (a: LabelBox, b: LabelBox) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

describe('outsideDirection', () => {
  it('points away from both rays of the angle', () => {
    const out = outsideDirection({ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 100 });
    expect(out.x).toBeCloseTo(-Math.SQRT1_2);
    expect(out.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it('points up for a straight angle', () => {
    const out = outsideDirection({ x: -100, y: 50 }, { x: 0, y: 50 }, { x: 100, y: 50 });
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(-1);
  });
});

describe('placeAngleLabels', () => {
  it('keeps labels of joints on top of each other apart and inside the canvas', () => {
    const angle = { a: { x: 100, y: 0 }, vertex: { x: 150, y: 150 }, c: { x: 200, y: 0 }, width: 90, height: 28 };
    const boxes = placeAngleLabels([angle, angle, angle], { left: 0, top: 0, right: 300, bottom: 300 }, [{ left: 105, top: 170, width: 90, height: 28 }]);
    expect(boxes).toHaveLength(3);
    for (const [index, box] of boxes.entries()) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top + box.height).toBeLessThanOrEqual(300);
      boxes.slice(index + 1).forEach((other) => expect(overlap(box, other)).toBe(false));
    }
  });
});

describe('placeAngleLabels with obstacles', () => {
  it('moves a label off the body when there is free room', () => {
    // A horizontal body line runs right where the label would go by default.
    const body = sampleSegments([[{ x: 0, y: 100 }, { x: 300, y: 100 }]]);
    const angle = { a: { x: 100, y: 160 }, vertex: { x: 150, y: 130 }, c: { x: 200, y: 160 }, width: 90, height: 28 };
    const [box] = placeAngleLabels([angle], { left: 0, top: 0, right: 300, bottom: 300 }, [], body);
    expect(body.some((p) => p.x >= box.left && p.x <= box.left + box.width && p.y >= box.top && p.y <= box.top + box.height)).toBe(false);
  });
});
