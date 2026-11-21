import test from 'node:test';
import assert from 'node:assert/strict';
import { lintSnapshot, lintSnapshots } from './lint_layout.mjs';

const STANDARD_VIEWPORT = {
  width: 390,
  height: 844,
  fontScale: 1.0,
  safeArea: { top: 44, bottom: 34, left: 0, right: 0 },
};

function makeNode(overrides) {
  return {
    id: 'n1',
    testId: null,
    parentId: 'root',
    role: 'container',
    text: null,
    bounds: { x: 16, y: 60, width: 358, height: 48 },
    interactive: false,
    visible: true,
    scrollable: false,
    clipped: false,
    textTruncated: false,
    zLayer: 0,
    ...overrides,
  };
}

function makeSnapshot(nodes, viewport = STANDARD_VIEWPORT) {
  return {
    screen: 'checkout',
    state: 'default',
    profile: 'standard',
    viewport,
    nodes: [
      makeNode({
        id: 'root',
        testId: 'screen_root',
        parentId: null,
        role: 'container',
        bounds: { x: 0, y: 0, width: viewport.width, height: viewport.height },
      }),
      ...nodes,
    ],
  };
}

test('catches sibling_overlap between non-ancestor content nodes in same zLayer', () => {
  const snap = makeSnapshot([
    makeNode({
      id: 'btn',
      testId: 'btn_confirm_order',
      role: 'button',
      interactive: true,
      bounds: { x: 16, y: 200, width: 200, height: 48 },
    }),
    makeNode({
      id: 'txt',
      testId: 'txt_disclaimer',
      role: 'text',
      text: 'Terms apply',
      bounds: { x: 68, y: 237, width: 200, height: 24 },
    }),
  ]);
  const res = lintSnapshot(snap);
  const overlap = res.violations.find((v) => v.rule === 'sibling_overlap');
  assert.ok(overlap, 'Expected sibling_overlap violation');
  assert.equal(overlap.severity, 'error');
  assert.deepEqual(overlap.nodes, ['btn_confirm_order', 'txt_disclaimer']);
  assert.match(overlap.detail, /overlap 148x11px/);
});

test('does NOT flag normal parent-child containment as sibling_overlap', () => {
  const snap = makeSnapshot([
    makeNode({
      id: 'card',
      testId: 'card_item',
      role: 'button',
      interactive: true,
      bounds: { x: 16, y: 60, width: 358, height: 64 },
    }),
    makeNode({
      id: 'label',
      testId: 'card_title',
      parentId: 'card',
      role: 'text',
      text: 'Fresh Pasta',
      bounds: { x: 32, y: 76, width: 200, height: 24 },
    }),
  ]);
  const res = lintSnapshot(snap);
  assert.equal(res.errors, 0, `Unexpected errors: ${JSON.stringify(res.violations)}`);
});

test('catches near_miss_alignment of 3px and ignores exact 0px or >6px indentation', () => {
  const snap = makeSnapshot([
    makeNode({
      id: 'a',
      testId: 'row_subtotal_label',
      role: 'text',
      text: 'Subtotal',
      bounds: { x: 16, y: 100, width: 120, height: 24 },
    }),
    makeNode({
      id: 'b',
      testId: 'row_total_label',
      role: 'text',
      text: 'Total',
      bounds: { x: 19, y: 140, width: 120, height: 24 },
    }),
    makeNode({
      id: 'c',
      testId: 'row_indented_note',
      role: 'text',
      text: 'Indented intentionally',
      bounds: { x: 32, y: 180, width: 120, height: 24 },
    }),
  ]);
  const res = lintSnapshot(snap);
  const nm = res.violations.filter((v) => v.rule === 'near_miss_alignment');
  assert.equal(nm.length, 1);
  assert.equal(nm[0].severity, 'warning');
  assert.deepEqual(nm[0].nodes, ['row_subtotal_label', 'row_total_label']);
  assert.match(nm[0].detail, /delta 3px/);
});

test('catches viewport_overflow on non-scrollable nodes and allows vertical scroll lists', () => {
  const snap = makeSnapshot([
    makeNode({
      id: 'bad_wide',
      testId: 'overflow_banner',
      role: 'text',
      text: 'Too wide',
      bounds: { x: 200, y: 60, width: 240, height: 32 },
    }),
    makeNode({
      id: 'scroll',
      testId: 'main_scroll',
      role: 'scroll_container',
      scrollable: true,
      scrollAxis: 'vertical',
      bounds: { x: 0, y: 100, width: 390, height: 700 },
    }),
    makeNode({
      id: 'below_fold',
      testId: 'scroll_item_20',
      parentId: 'scroll',
      role: 'text',
      text: 'Item below viewport fold',
      bounds: { x: 16, y: 1200, width: 358, height: 48 },
    }),
  ]);
  const res = lintSnapshot(snap);
  const overflows = res.violations.filter((v) => v.rule === 'viewport_overflow');
  assert.equal(overflows.length, 1);
  assert.deepEqual(overflows[0].nodes, ['overflow_banner']);
});

test('catches touch_target_too_small and respects hitSlop expansion', () => {
  const snap = makeSnapshot([
    makeNode({
      id: 'tiny',
      testId: 'icon_info_tooltip',
      role: 'button',
      interactive: true,
      bounds: { x: 16, y: 60, width: 24, height: 24 },
    }),
    makeNode({
      id: 'slopped',
      testId: 'icon_with_slop',
      role: 'button',
      interactive: true,
      bounds: { x: 80, y: 60, width: 36, height: 36 },
      hitSlop: { top: 6, bottom: 6, left: 6, right: 6 },
    }),
  ]);
  const res = lintSnapshot(snap, { minTouchTarget: 44 });
  const small = res.violations.filter((v) => v.rule === 'touch_target_too_small');
  assert.equal(small.length, 1);
  assert.deepEqual(small[0].nodes, ['icon_info_tooltip']);
  assert.match(small[0].detail, /24x24px \(min 44x44px\)/);
});

test('catches safe_area_violation, parent_clipping, collapsed content, and spacing rules', () => {
  const snap = makeSnapshot([
    makeNode({
      id: 'top_intrude',
      testId: 'header_title',
      role: 'text',
      text: 'Under notch',
      bounds: { x: 16, y: 12, width: 200, height: 24 },
    }),
    makeNode({
      id: 'box',
      testId: 'clip_box',
      role: 'container',
      bounds: { x: 16, y: 100, width: 100, height: 40 },
    }),
    makeNode({
      id: 'clipped_child',
      testId: 'clipped_text',
      parentId: 'box',
      role: 'text',
      text: 'Too long for parent',
      bounds: { x: 16, y: 100, width: 160, height: 40 },
      textTruncated: true,
    }),
    makeNode({
      id: 'collapsed',
      testId: 'invisible_label',
      role: 'text',
      text: 'Should be visible',
      bounds: { x: 16, y: 200, width: 0, height: 20 },
    }),
  ]);
  const res = lintSnapshot(snap);
  const rules = new Set(res.violations.map((v) => v.rule));
  assert.ok(rules.has('safe_area_violation'));
  assert.ok(rules.has('parent_clipping'));
  assert.ok(rules.has('collapsed_or_invisible_content'));
});

test('honors allowlist ignore rules in audit.config.json', () => {
  const snap = makeSnapshot([
    makeNode({
      id: 'icon',
      testId: 'cart_icon',
      role: 'icon',
      bounds: { x: 16, y: 60, width: 28, height: 28 },
    }),
    makeNode({
      id: 'badge',
      testId: 'badge_cart_count',
      role: 'text',
      text: '3',
      bounds: { x: 30, y: 56, width: 18, height: 18 },
    }),
  ]);
  const res = lintSnapshot(snap, {
    ignore: [
      {
        screen: '*',
        rule: 'sibling_overlap',
        nodePattern: 'badge_*',
        reason: 'Notification badges intentionally overlap parent icons',
      },
    ],
  });
  assert.equal(res.violations.filter((v) => v.rule === 'sibling_overlap').length, 0);
});

test('lintSnapshots summarizes pass/fail counts cleanly', () => {
  const cleanSnap = makeSnapshot([
    makeNode({
      id: 'btn',
      testId: 'btn_ok',
      role: 'button',
      interactive: true,
      bounds: { x: 16, y: 64, width: 358, height: 48 },
    }),
  ]);
  const report = lintSnapshots([cleanSnap]);
  assert.equal(report.summary.screensChecked, 1);
  assert.equal(report.summary.passed, 1);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.failures.length, 0);
});

test('a word wider than its line is an error, an ellipsis only a warning', () => {
  const snap = makeSnapshot([
    makeNode({ id: 'title', testId: 'resume_label', role: 'text', text: 'ALLENAMENTO', textOverflow: 'word' }),
    makeNode({ id: 'name', testId: 'row_name', role: 'text', text: 'Very long exercise name', y: 120, textTruncated: true, bounds: { x: 16, y: 120, width: 358, height: 20 } }),
  ]);
  const res = lintSnapshot(snap);
  const word = res.violations.find((v) => v.nodes.includes('resume_label'));
  const ellipsis = res.violations.find((v) => v.nodes.includes('row_name'));
  assert.equal(word.severity, 'error');
  assert.equal(word.rule, 'parent_clipping');
  assert.equal(ellipsis.severity, 'warning');
  assert.equal(ellipsis.rule, 'text_truncated');
});

test('names nodes without a testID by their accessibility label', () => {
  const snap = makeSnapshot([
    makeNode({ id: 'n_7', role: 'button', interactive: true, label: 'Sunday', bounds: { x: 16, y: 60, width: 30, height: 48 } }),
  ]);
  const res = lintSnapshot(snap);
  const small = res.violations.find((v) => v.rule === 'touch_target_too_small');
  assert.deepEqual(small.nodes, ['n_7"Sunday"']);
});

test('an allowlisted node also covers the nodes inside it', () => {
  const snap = makeSnapshot([
    makeNode({ id: 'fab', testId: 'fab-create', role: 'button', interactive: true, bounds: { x: 200, y: 60, width: 100, height: 56 } }),
    makeNode({ id: 'fab_label', parentId: 'fab', role: 'text', text: 'Create', bounds: { x: 240, y: 70, width: 50, height: 20 } }),
    makeNode({ id: 'row', role: 'text', text: 'Row under the button', bounds: { x: 16, y: 60, width: 358, height: 40 } }),
  ]);
  const res = lintSnapshot(snap, { ignore: [{ screen: '*', rule: 'sibling_overlap', nodePattern: 'fab-*', reason: 'floats' }] });
  assert.equal(res.violations.filter((v) => v.rule === 'sibling_overlap').length, 0);
});
