#!/usr/bin/env node
/**
 * Deterministic, zero-dependency geometric UI layout linter.
 *
 * Consumes standardized layout snapshot JSON files (see schema.json) produced by
 * any platform extractor (React Native, Jetpack Compose, Flutter, SwiftUI) and
 * emits a compact, token-efficient violation report.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_CONFIG = {
  gridUnit: 4,
  gridTolerancePx: 1,
  minTouchTarget: 44,
  overlapTolerancePx: 1.5,
  parentClipTolerancePx: 2,
  nearMissRangePx: [1, 6],
  spacingVarianceTolerancePx: 1,
  maxViolationsPerScreen: 20,
  ignore: [],
};

const CONTENT_ROLES = new Set(['text', 'button', 'input', 'image', 'icon']);

function globToRegex(pattern) {
  const escaped = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function matchesGlob(value, pattern) {
  if (!pattern || pattern === '*') return true;
  if (value == null) return false;
  return globToRegex(pattern).test(String(value));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function nodeLabel(node) {
  if (node.testId) return node.testId;
  // Without a testID, name the node by what a reader sees: its accessibility label or text.
  const hint = (node.label || node.text || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return hint ? `${node.id}"${hint}"` : node.id;
}

function hasText(node) {
  return typeof node.text === 'string' && node.text.trim().length > 0;
}

function isContentOrInteractive(node) {
  return Boolean(node.interactive || CONTENT_ROLES.has(node.role) || hasText(node));
}

function buildTreeIndex(nodes) {
  const byId = new Map();
  const childrenByParent = new Map();
  for (const node of nodes) {
    byId.set(node.id, node);
    const key = node.parentId ?? '__root__';
    let list = childrenByParent.get(key);
    if (!list) {
      list = [];
      childrenByParent.set(key, list);
    }
    list.push(node);
  }

  const ancestorSets = new Map();
  function getAncestors(id) {
    if (ancestorSets.has(id)) return ancestorSets.get(id);
    const set = new Set();
    let cur = byId.get(id);
    let guard = 0;
    while (cur && cur.parentId && guard < 256) {
      set.add(cur.parentId);
      cur = byId.get(cur.parentId);
      guard++;
    }
    ancestorSets.set(id, set);
    return set;
  }

  function isAncestorOrDescendant(a, b) {
    return getAncestors(a.id).has(b.id) || getAncestors(b.id).has(a.id);
  }

  function hasScrollableAncestor(node, axis) {
    let cur = node.parentId ? byId.get(node.parentId) : null;
    let guard = 0;
    while (cur && guard < 256) {
      if (cur.scrollable || cur.role === 'scroll_container') {
        const scrollAxis = cur.scrollAxis || 'vertical';
        if (scrollAxis === 'both' || scrollAxis === axis) {
          return true;
        }
      }
      cur = cur.parentId ? byId.get(cur.parentId) : null;
      guard++;
    }
    return false;
  }

  return { byId, childrenByParent, isAncestorOrDescendant, hasScrollableAncestor };
}

function isIgnored(screen, rule, nodeObjs, ignoreRules, byId = null) {
  if (!ignoreRules || ignoreRules.length === 0) return false;
  // A node inside an allowlisted one (the icon and label of a floating button) is covered too.
  const withAncestors = [];
  for (const node of nodeObjs) {
    let cur = node;
    let guard = 0;
    while (cur && guard++ < 256) {
      withAncestors.push(cur);
      cur = byId && cur.parentId ? byId.get(cur.parentId) : null;
    }
  }
  for (const entry of ignoreRules) {
    if (!matchesGlob(screen, entry.screen ?? '*')) continue;
    if (!matchesGlob(rule, entry.rule ?? '*')) continue;
    const pat = entry.nodePattern ?? '*';
    if (pat === '*') return true;
    for (const n of withAncestors) {
      if (matchesGlob(n.testId, pat) || matchesGlob(n.id, pat)) {
        return true;
      }
    }
  }
  return false;
}

function offGridDelta(value, gridUnit) {
  if (!gridUnit || gridUnit <= 1) return 0;
  const absVal = Math.abs(value);
  const rem = absVal % gridUnit;
  return Math.min(rem, gridUnit - rem);
}

/**
 * Lint a single snapshot object against all geometric rules.
 */
export function lintSnapshot(snapshot, rawConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...rawConfig };
  const ignoreRules = Array.isArray(config.ignore) ? config.ignore : [];
  const screen = snapshot.screen || 'unknown';
  const state = snapshot.state || 'default';
  const profile = snapshot.profile || `${snapshot.viewport?.width}x${snapshot.viewport?.height}@${snapshot.viewport?.fontScale}`;
  const viewport = snapshot.viewport;
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];

  const { byId, childrenByParent, isAncestorOrDescendant, hasScrollableAncestor } = buildTreeIndex(nodes);
  const rawViolations = [];

  function pushViolation(severity, rule, nodeObjs, detail, groupKey = null) {
    if (isIgnored(screen, rule, nodeObjs, ignoreRules, byId)) return;
    rawViolations.push({
      severity,
      rule,
      nodes: nodeObjs.map(nodeLabel),
      detail,
      _groupKey: groupKey || `${severity}|${rule}|${detail}`,
    });
  }

  const visibleNodes = nodes.filter((n) => n && n.visible !== false && n.bounds);

  // ---------------------------------------------------------------------------
  // Rule 8: collapsed_or_invisible_content
  // ---------------------------------------------------------------------------
  for (const node of visibleNodes) {
    if (node.interactive || hasText(node)) {
      if (node.bounds.width <= 1 || node.bounds.height <= 1) {
        pushViolation(
          'error',
          'collapsed_or_invisible_content',
          [node],
          `${round1(node.bounds.width)}x${round1(node.bounds.height)}px`
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Rule 7: touch_target_too_small
  // ---------------------------------------------------------------------------
  const minTarget = config.minTouchTarget;
  for (const node of visibleNodes) {
    if (!node.interactive) continue;
    const slop = node.hitSlop || { top: 0, bottom: 0, left: 0, right: 0 };
    const effW = node.bounds.width + (slop.left || 0) + (slop.right || 0);
    const effH = node.bounds.height + (slop.top || 0) + (slop.bottom || 0);
    if (effW < minTarget - 0.1 || effH < minTarget - 0.1) {
      pushViolation(
        'error',
        'touch_target_too_small',
        [node],
        `${round1(effW)}x${round1(effH)}px (min ${minTarget}x${minTarget}px)`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Rule 2: viewport_overflow
  // ---------------------------------------------------------------------------
  for (const node of visibleNodes) {
    const b = node.bounds;
    if (b.width <= 0 && b.height <= 0 && !isContentOrInteractive(node)) continue;

    const hScroll = hasScrollableAncestor(node, 'horizontal');
    const vScroll = hasScrollableAncestor(node, 'vertical');

    if (!hScroll) {
      if (b.x < -1) {
        pushViolation(
          'error',
          'viewport_overflow',
          [node],
          `left edge x=${round1(b.x)}px < 0`
        );
      } else if (b.x + b.width > viewport.width + 1) {
        pushViolation(
          'error',
          'viewport_overflow',
          [node],
          `right edge ${round1(b.x + b.width)}px > viewport ${viewport.width}px (+${round1(b.x + b.width - viewport.width)}px)`
        );
      }
    }

    if (!vScroll) {
      if (b.y < -1) {
        pushViolation(
          'error',
          'viewport_overflow',
          [node],
          `top edge y=${round1(b.y)}px < 0`
        );
      } else if (b.y + b.height > viewport.height + 1) {
        pushViolation(
          'error',
          'viewport_overflow',
          [node],
          `bottom edge ${round1(b.y + b.height)}px > viewport ${viewport.height}px (+${round1(b.y + b.height - viewport.height)}px)`
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Rule 3: safe_area_violation
  // ---------------------------------------------------------------------------
  const sa = viewport.safeArea || { top: 0, bottom: 0, left: 0, right: 0 };
  for (const node of visibleNodes) {
    const isTextOrInteractive = node.interactive || (node.role === 'text' && hasText(node));
    if (!isTextOrInteractive) continue;
    const b = node.bounds;
    if (b.width <= 0 || b.height <= 0) continue;

    if (sa.top > 0 && b.y < sa.top - 0.5 && b.y + b.height > 0) {
      pushViolation(
        'error',
        'safe_area_violation',
        [node],
        `top y=${round1(b.y)}px intrudes into safeArea.top=${sa.top}px`
      );
    }

    const vScroll = hasScrollableAncestor(node, 'vertical');
    if (
      sa.bottom > 0 &&
      !vScroll &&
      b.y < viewport.height &&
      b.y + b.height > viewport.height - sa.bottom + 0.5
    ) {
      pushViolation(
        'error',
        'safe_area_violation',
        [node],
        `bottom ${round1(b.y + b.height)}px intrudes into safeArea.bottom=${sa.bottom}px (limit ${viewport.height - sa.bottom}px)`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Rule 4: parent_clipping
  // ---------------------------------------------------------------------------
  const clipTol = config.parentClipTolerancePx;
  for (const node of visibleNodes) {
    if (node.clipped) {
      pushViolation('error', 'parent_clipping', [node], 'node flagged clipped=true');
    }
    if (node.textOverflow === 'word') {
      // A word wider than its line: clipped on web, broken mid-word on Android. Always a bug.
      pushViolation('error', 'parent_clipping', [node], 'a word does not fit its line (textOverflow=word)');
    } else if (node.textTruncated) {
      // Cut by numberOfLines with an ellipsis: often intended (long names in one-line rows), so a warning.
      pushViolation('warning', 'text_truncated', [node], 'text cut with an ellipsis (numberOfLines)');
    }
    if (!node.parentId) continue;
    const parent = byId.get(node.parentId);
    if (!parent || parent.scrollable || parent.role === 'scroll_container') continue;
    const pb = parent.bounds;
    const cb = node.bounds;
    if (!pb || pb.width <= 0 || pb.height <= 0 || (cb.width <= 0 && cb.height <= 0)) continue;

    const overLeft = pb.x - cb.x;
    const overRight = cb.x + cb.width - (pb.x + pb.width);
    const overTop = pb.y - cb.y;
    const overBottom = cb.y + cb.height - (pb.y + pb.height);
    const maxOver = Math.max(overLeft, overRight, overTop, overBottom);
    if (maxOver > clipTol) {
      const edges = [];
      if (overLeft > clipTol) edges.push(`left +${round1(overLeft)}px`);
      if (overRight > clipTol) edges.push(`right +${round1(overRight)}px`);
      if (overTop > clipTol) edges.push(`top +${round1(overTop)}px`);
      if (overBottom > clipTol) edges.push(`bottom +${round1(overBottom)}px`);
      pushViolation(
        'error',
        'parent_clipping',
        [node, parent],
        `exceeds parent bounds (${edges.join(', ')})`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Rule 1: sibling_overlap
  // ---------------------------------------------------------------------------
  const overlapTol = config.overlapTolerancePx;
  const overlapCandidates = visibleNodes.filter(
    (n) => isContentOrInteractive(n) && n.bounds.width > 0 && n.bounds.height > 0
  );

  // Partition by zLayer for fast O(k^2) per layer
  const byLayer = new Map();
  for (const n of overlapCandidates) {
    const z = n.zLayer ?? 0;
    let list = byLayer.get(z);
    if (!list) {
      list = [];
      byLayer.set(z, list);
    }
    list.push(n);
  }

  function getVisibleRect(node) {
    let x1 = node.bounds.x;
    let y1 = node.bounds.y;
    let x2 = node.bounds.x + node.bounds.width;
    let y2 = node.bounds.y + node.bounds.height;
    let cur = node.parentId ? byId.get(node.parentId) : null;
    let guard = 0;
    while (cur && guard < 256) {
      if ((cur.scrollable || cur.role === 'scroll_container') && cur.bounds) {
        x1 = Math.max(x1, cur.bounds.x);
        y1 = Math.max(y1, cur.bounds.y);
        x2 = Math.min(x2, cur.bounds.x + cur.bounds.width);
        y2 = Math.min(y2, cur.bounds.y + cur.bounds.height);
      }
      cur = cur.parentId ? byId.get(cur.parentId) : null;
      guard++;
    }
    if (x2 <= x1 || y2 <= y1) return null;
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }

  function findScrollAncestorId(node) {
    let cur = node.parentId ? byId.get(node.parentId) : null;
    let guard = 0;
    while (cur && guard < 256) {
      if (cur.scrollable || cur.role === 'scroll_container') return cur.id;
      cur = cur.parentId ? byId.get(cur.parentId) : null;
      guard++;
    }
    return null;
  }

  for (const layerNodes of byLayer.values()) {
    for (let i = 0; i < layerNodes.length; i++) {
      const a = layerNodes[i];
      const scrollA = findScrollAncestorId(a);
      const rectA = getVisibleRect(a);
      for (let j = i + 1; j < layerNodes.length; j++) {
        const b = layerNodes[j];
        if (isAncestorOrDescendant(a, b)) continue;

        const scrollB = findScrollAncestorId(b);
        // Same scroll container: compare full bounds; across scroll boundaries: compare visible clipped rects
        const ba = scrollA === scrollB ? a.bounds : rectA;
        const bb = scrollA === scrollB ? b.bounds : getVisibleRect(b);
        if (!ba || !bb) continue;

        const ix = Math.min(ba.x + ba.width, bb.x + bb.width) - Math.max(ba.x, bb.x);
        if (ix <= overlapTol) continue;
        const iy = Math.min(ba.y + ba.height, bb.y + bb.height) - Math.max(ba.y, bb.y);
        if (iy <= overlapTol) continue;

        pushViolation(
          'error',
          'sibling_overlap',
          [a, b],
          `overlap ${round1(ix)}x${round1(iy)}px`
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Rule 5: near_miss_alignment & Rule 6: inconsistent_spacing / off_grid_spacing
  // ---------------------------------------------------------------------------
  const [nmMin, nmMax] = config.nearMissRangePx;
  const gridUnit = config.gridUnit;
  const gridTol = config.gridTolerancePx;
  const spaceVarTol = config.spacingVarianceTolerancePx;

  for (const [parentKey, siblings] of childrenByParent.entries()) {
    const visSiblings = siblings.filter(
      (n) => n.visible !== false && n.bounds && n.bounds.width > 1 && n.bounds.height > 1
    );
    if (visSiblings.length < 2) continue;

    // 5a. Near-miss alignment among sibling pairs
    for (let i = 0; i < visSiblings.length; i++) {
      const a = visSiblings[i];
      for (let j = i + 1; j < visSiblings.length; j++) {
        const b = visSiblings[j];
        if ((a.zLayer ?? 0) !== (b.zLayer ?? 0)) continue;

        const hOverlap =
          Math.min(a.bounds.x + a.bounds.width, b.bounds.x + b.bounds.width) -
          Math.max(a.bounds.x, b.bounds.x);
        const vOverlap =
          Math.min(a.bounds.y + a.bounds.height, b.bounds.y + b.bounds.height) -
          Math.max(a.bounds.y, b.bounds.y);

        // Vertically stacked siblings
        if (hOverlap > 0 && vOverlap <= 1) {
          const leftDiff = Math.abs(a.bounds.x - b.bounds.x);
          const rightA = a.bounds.x + a.bounds.width;
          const rightB = b.bounds.x + b.bounds.width;
          const rightDiff = Math.abs(rightA - rightB);
          const cxA = a.bounds.x + a.bounds.width / 2;
          const cxB = b.bounds.x + b.bounds.width / 2;
          const centerDiff = Math.abs(cxA - cxB);

          // If intentionally centered or right-aligned (0px), skip left near-miss
          if (leftDiff >= nmMin && leftDiff <= nmMax && rightDiff > 0.5 && centerDiff > 0.5) {
            pushViolation(
              'warning',
              'near_miss_alignment',
              [a, b],
              `left edge x=${round1(a.bounds.x)} vs x=${round1(b.bounds.x)} (delta ${round1(leftDiff)}px)`
            );
          } else if (rightDiff >= nmMin && rightDiff <= nmMax && leftDiff > 0.5 && centerDiff > 0.5) {
            pushViolation(
              'warning',
              'near_miss_alignment',
              [a, b],
              `right edge ${round1(rightA)} vs ${round1(rightB)} (delta ${round1(rightDiff)}px)`
            );
          } else if (centerDiff >= nmMin && centerDiff <= nmMax && leftDiff > 0.5 && rightDiff > 0.5) {
            pushViolation(
              'warning',
              'near_miss_alignment',
              [a, b],
              `horiz center ${round1(cxA)} vs ${round1(cxB)} (delta ${round1(centerDiff)}px)`
            );
          }
        }

        // Horizontally adjacent siblings
        if (vOverlap > 0 && hOverlap <= 1) {
          const topDiff = Math.abs(a.bounds.y - b.bounds.y);
          const botA = a.bounds.y + a.bounds.height;
          const botB = b.bounds.y + b.bounds.height;
          const botDiff = Math.abs(botA - botB);
          const cyA = a.bounds.y + a.bounds.height / 2;
          const cyB = b.bounds.y + b.bounds.height / 2;
          const centerDiff = Math.abs(cyA - cyB);

          if (topDiff >= nmMin && topDiff <= nmMax && botDiff > 0.5 && centerDiff > 0.5) {
            pushViolation(
              'warning',
              'near_miss_alignment',
              [a, b],
              `top edge y=${round1(a.bounds.y)} vs y=${round1(b.bounds.y)} (delta ${round1(topDiff)}px)`
            );
          } else if (centerDiff >= nmMin && centerDiff <= nmMax && topDiff > 0.5 && botDiff > 0.5) {
            pushViolation(
              'warning',
              'near_miss_alignment',
              [a, b],
              `vert center ${round1(cyA)} vs ${round1(cyB)} (delta ${round1(centerDiff)}px)`
            );
          }
        }
      }
    }

    // 6a. Spacing consistency & off-grid gaps along dominant axis
    const byY = [...visSiblings].sort((a, b) => a.bounds.y - b.bounds.y);
    const byX = [...visSiblings].sort((a, b) => a.bounds.x - b.bounds.x);

    const vGaps = [];
    for (let i = 0; i < byY.length - 1; i++) {
      const a = byY[i];
      const b = byY[i + 1];
      const hOverlap =
        Math.min(a.bounds.x + a.bounds.width, b.bounds.x + b.bounds.width) -
        Math.max(a.bounds.x, b.bounds.x);
      const gap = b.bounds.y - (a.bounds.y + a.bounds.height);
      if (hOverlap > 0 && gap >= -0.5) {
        vGaps.push({ gap: Math.max(0, gap), a, b });
      }
    }

    const hGaps = [];
    for (let i = 0; i < byX.length - 1; i++) {
      const a = byX[i];
      const b = byX[i + 1];
      const vOverlap =
        Math.min(a.bounds.y + a.bounds.height, b.bounds.y + b.bounds.height) -
        Math.max(a.bounds.y, b.bounds.y);
      const gap = b.bounds.x - (a.bounds.x + a.bounds.width);
      if (vOverlap > 0 && gap >= -0.5) {
        hGaps.push({ gap: Math.max(0, gap), a, b });
      }
    }

    const parentNode = parentKey !== '__root__' ? byId.get(parentKey) : null;

    if (vGaps.length >= 2 && vGaps.length === byY.length - 1) {
      const vals = vGaps.map((g) => g.gap);
      const minG = Math.min(...vals);
      const maxG = Math.max(...vals);
      if (maxG - minG > spaceVarTol) {
        pushViolation(
          'warning',
          'inconsistent_spacing',
          parentNode ? [parentNode] : [vGaps[0].a, vGaps[vGaps.length - 1].b],
          `vertical gaps vary ${round1(minG)}..${round1(maxG)}px (${vals.slice(0, 6).map(round1).join(', ')})`
        );
      }
      if (gridUnit > 1) {
        for (const item of vGaps) {
          if (item.gap > 0 && offGridDelta(item.gap, gridUnit) > gridTol) {
            pushViolation(
              'warning',
              'off_grid_spacing',
              [item.a, item.b],
              `vertical gap ${round1(item.gap)}px not a multiple of ${gridUnit}px`
            );
          }
        }
      }
    }

    if (hGaps.length >= 2 && hGaps.length === byX.length - 1) {
      const vals = hGaps.map((g) => g.gap);
      const minG = Math.min(...vals);
      const maxG = Math.max(...vals);
      if (maxG - minG > spaceVarTol) {
        pushViolation(
          'warning',
          'inconsistent_spacing',
          parentNode ? [parentNode] : [hGaps[0].a, hGaps[hGaps.length - 1].b],
          `horizontal gaps vary ${round1(minG)}..${round1(maxG)}px (${vals.slice(0, 6).map(round1).join(', ')})`
        );
      }
      if (gridUnit > 1) {
        for (const item of hGaps) {
          if (item.gap > 0 && offGridDelta(item.gap, gridUnit) > gridTol) {
            pushViolation(
              'warning',
              'off_grid_spacing',
              [item.a, item.b],
              `horizontal gap ${round1(item.gap)}px not a multiple of ${gridUnit}px`
            );
          }
        }
      }
    }
  }

  // 6b. Outer screen horizontal padding off-grid check (check content leaves closest to left edge)
  if (gridUnit > 1) {
    const leftEdges = visibleNodes
      .filter((n) => isContentOrInteractive(n) && n.bounds.x > 0 && n.bounds.width > 1)
      .map((n) => ({ node: n, x: n.bounds.x }));
    if (leftEdges.length > 0) {
      const minX = Math.min(...leftEdges.map((e) => e.x));
      if (minX > 0 && minX <= 48 && offGridDelta(minX, gridUnit) > gridTol) {
        const rep = leftEdges.find((e) => e.x === minX);
        if (rep) {
          pushViolation(
            'warning',
            'off_grid_spacing',
            [rep.node],
            `outer left padding ${round1(minX)}px not a multiple of ${gridUnit}px`
          );
        }
      }
    }
  }

  // Group identical repeated violations and cap per screen
  const grouped = new Map();
  for (const v of rawViolations) {
    const existing = grouped.get(v._groupKey);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
    } else {
      grouped.set(v._groupKey, {
        severity: v.severity,
        rule: v.rule,
        nodes: v.nodes,
        detail: v.detail,
        count: 1,
      });
    }
  }

  const allGrouped = Array.from(grouped.values()).sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return a.rule.localeCompare(b.rule);
  });

  const errors = rawViolations.filter((v) => v.severity === 'error').length;
  const warnings = rawViolations.filter((v) => v.severity === 'warning').length;

  const cap = config.maxViolationsPerScreen ?? 20;
  const truncatedCount = Math.max(0, allGrouped.length - cap);
  const violations = allGrouped.slice(0, cap).map((v) => {
    const out = { severity: v.severity, rule: v.rule, nodes: v.nodes, detail: v.detail };
    if (v.count > 1) out.count = v.count;
    return out;
  });

  return {
    screen,
    state,
    profile,
    errors,
    warnings,
    violations,
    truncatedCount,
  };
}

/**
 * Lint a directory (or list) of snapshot JSON files and return the compact report.
 */
export function lintSnapshots(snapshots, config = {}, { strict = false } = {}) {
  let passed = 0;
  let failed = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  const failures = [];

  for (const snap of snapshots) {
    const res = lintSnapshot(snap, config);
    totalErrors += res.errors;
    totalWarnings += res.warnings;
    const isFail = res.errors > 0 || (strict && res.warnings > 0);
    if (isFail) {
      failed++;
      const entry = {
        screen: res.screen,
        state: res.state,
        profile: res.profile,
        violations: res.violations,
      };
      if (res.truncatedCount > 0) entry.truncatedCount = res.truncatedCount;
      failures.push(entry);
    } else if (res.warnings > 0 && !strict) {
      // Non-strict mode: passes exit code, but still surfaces warnings if present?
      // Keep clean screens out of `failures` when strict=false so failed=0 stays minimal.
      passed++;
    } else {
      passed++;
    }
  }

  return {
    summary: {
      screensChecked: snapshots.length,
      passed,
      failed,
      errors: totalErrors,
      warnings: totalWarnings,
    },
    failures,
  };
}

function parseCliArgs(argv) {
  const args = {
    snapshotsDir: '.ui-audit/snapshots',
    configPath: 'tools/ui-audit/audit.config.json',
    screen: null,
    state: null,
    profile: null,
    strict: false,
    pretty: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--snapshots-dir' && argv[i + 1]) args.snapshotsDir = argv[++i];
    else if (arg === '--config' && argv[i + 1]) args.configPath = argv[++i];
    else if (arg === '--screen' && argv[i + 1]) args.screen = argv[++i];
    else if (arg === '--state' && argv[i + 1]) args.state = argv[++i];
    else if (arg === '--profile' && argv[i + 1]) args.profile = argv[++i];
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--pretty') args.pretty = true;
  }
  return args;
}

function runCli() {
  const args = parseCliArgs(process.argv.slice(2));
  let config = {};
  if (fs.existsSync(args.configPath)) {
    config = JSON.parse(fs.readFileSync(args.configPath, 'utf8'));
  }

  if (!fs.existsSync(args.snapshotsDir)) {
    console.error(JSON.stringify({ error: `Snapshots directory not found: ${args.snapshotsDir}` }));
    process.exit(2);
  }

  const files = fs
    .readdirSync(args.snapshotsDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const snapshots = [];
  for (const file of files) {
    const snap = JSON.parse(fs.readFileSync(path.join(args.snapshotsDir, file), 'utf8'));
    if (args.screen && snap.screen !== args.screen) continue;
    if (args.state && snap.state !== args.state) continue;
    if (args.profile && snap.profile !== args.profile) continue;
    snapshots.push(snap);
  }

  if (snapshots.length === 0) {
    console.error(JSON.stringify({ error: 'No matching snapshots found to lint.' }));
    process.exit(2);
  }

  const report = lintSnapshots(snapshots, config, { strict: args.strict });

  if (report.summary.failed === 0) {
    console.log(JSON.stringify({ status: 'PASS', summary: report.summary }));
    process.exitCode = 0;
  } else {
    // exitCode, not exit(): exit() can cut a large report written to a pipe.
    console.log(args.pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
