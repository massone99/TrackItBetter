/**
 * Zero-dependency React Native Flexbox layout solver & AuditSnapshot extractor.
 *
 * Takes a react-test-renderer JSON tree (`render(...).toJSON()`) and computes
 * realistic window-coordinate bounding boxes using React Native's Flexbox rules
 * (column default, flexGrow/flexShrink/flexBasis, flexWrap, gap, padding, margin,
 * position: absolute, ScrollView unbounded scroll axis, text wrapping & fontScale).
 */

import type {
  AuditBounds,
  AuditHitSlop,
  AuditNode,
  AuditNodeRole,
  AuditSnapshot,
  AuditViewport,
} from './types';

export interface RNJsonNode {
  type: string;
  props?: Record<string, any>;
  children?: (RNJsonNode | string | number | null | undefined)[] | null;
}

type FlatStyle = Record<string, any>;

function flattenStyle(style: any, out: FlatStyle = {}): FlatStyle {
  if (!style) return out;
  if (Array.isArray(style)) {
    for (const item of style) flattenStyle(item, out);
  } else if (typeof style === 'object') {
    Object.assign(out, style);
  }
  return out;
}

function num(val: any): number | undefined {
  return typeof val === 'number' && Number.isFinite(val) ? val : undefined;
}

function resolveDim(val: any, parentSize: number | undefined): number | undefined {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.endsWith('%') && parentSize !== undefined) {
    const pct = parseFloat(val);
    if (Number.isFinite(pct)) return (pct / 100) * parentSize;
  }
  return undefined;
}

function getEdges(style: FlatStyle, prefix: 'padding' | 'margin') {
  const all = num(style[prefix]) ?? 0;
  const h = num(style[`${prefix}Horizontal`]);
  const v = num(style[`${prefix}Vertical`]);
  const top = num(style[`${prefix}Top`]) ?? v ?? all;
  const bottom = num(style[`${prefix}Bottom`]) ?? v ?? all;
  const left = num(style[`${prefix}Left`]) ?? num(style[`${prefix}Start`]) ?? h ?? all;
  const right = num(style[`${prefix}Right`]) ?? num(style[`${prefix}End`]) ?? h ?? all;
  return { top, right, bottom, left };
}

function getBorders(style: FlatStyle) {
  const all = num(style.borderWidth) ?? 0;
  return {
    top: num(style.borderTopWidth) ?? all,
    right: num(style.borderRightWidth) ?? all,
    bottom: num(style.borderBottomWidth) ?? all,
    left: num(style.borderLeftWidth) ?? all,
  };
}

function normalizeHitSlop(raw: any): AuditHitSlop | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { top: raw, right: raw, bottom: raw, left: raw };
  }
  if (typeof raw === 'object') {
    const top = num(raw.top) ?? 0;
    const right = num(raw.right) ?? 0;
    const bottom = num(raw.bottom) ?? 0;
    const left = num(raw.left) ?? 0;
    if (top || right || bottom || left) return { top, right, bottom, left };
  }
  return null;
}

function extractTextContent(node: RNJsonNode): string {
  if (!node.children) return '';
  const parts: string[] = [];
  for (const child of node.children) {
    if (typeof child === 'string' || typeof child === 'number') {
      parts.push(String(child));
    } else if (child && typeof child === 'object') {
      parts.push(extractTextContent(child));
    }
  }
  return parts.join('');
}

/** Pieces a line can break between: words, and parts after a hyphen or slash ("Chest-to-wall", a URL), as Android does. */
function breakTokens(text: string): { text: string; space: boolean }[] {
  const out: { text: string; space: boolean }[] = [];
  for (const [index, word] of text.split(/\s+/).filter(Boolean).entries()) {
    const parts = word.split(/(?<=[-/])(?=.)/);
    parts.forEach((part, i) => out.push({ text: part, space: index > 0 && i === 0 }));
  }
  return out;
}

function measureTextOnce(
  text: string,
  style: FlatStyle,
  props: Record<string, any>,
  maxWidth: number | undefined,
  fontScale: number
): { width: number; height: number; truncated: boolean; wordOverflow: boolean } {
  const baseFont = num(style.fontSize) ?? 14;
  const allowScaling = props.allowFontScaling !== false;
  const maxMult = num(props.maxFontSizeMultiplier);
  const effScale = allowScaling
    ? maxMult !== undefined
      ? Math.min(fontScale, maxMult)
      : fontScale
    : 1;
  const fontSize = baseFont * effScale;
  const isBold =
    style.fontWeight === 'bold' ||
    style.fontWeight === '700' ||
    style.fontWeight === '800' ||
    style.fontWeight === '900';
  // Glyph widths in em, by character class (proportional fonts), scaled for the family: monospace
  // glyphs are all 0.6 em, condensed and bold families are narrower or wider than a regular sans.
  const family = String(style.fontFamily ?? '').toLowerCase();
  const weight = String(style.fontWeight ?? '');
  const bold = isBold || /bold|semibold|black|heavy/.test(family) || ['600', '700', '800', '900'].includes(weight);
  const mono = family.includes('mono');
  const familyScale = (family.includes('condensed') ? 0.86 : 1) * (bold ? 1.06 : 1);
  const upper = style.textTransform === 'uppercase';
  const spacing = (num(style.letterSpacing) ?? 0) * effScale;
  const glyphEm = (ch: string): number => {
    if (mono) return 0.6;
    if (ch === ' ') return 0.26;
    if ('iljtfr.,:;\'!|·'.includes(ch)) return 0.3;
    if ('mwMW'.includes(ch)) return 0.84;
    if (/[0-9]/.test(ch)) return 0.56;
    if (ch !== ch.toLowerCase()) return 0.66;
    return 0.53;
  };
  const widthOf = (str: string): number => {
    let em = 0;
    for (const ch of upper ? str.toUpperCase() : str) em += glyphEm(ch);
    return em * fontSize * (mono ? 1 : familyScale) + spacing * str.length;
  };
  const lineHeight = num(style.lineHeight) ?? Math.ceil(fontSize * 1.25);

  if (!text) {
    return { width: 0, height: lineHeight, truncated: false, wordOverflow: false };
  }

  const paragraphs = text.split('\n');
  const wrappedLines: string[] = [];
  const limitW = maxWidth !== undefined && maxWidth > 0 ? maxWidth : Infinity;

  for (const para of paragraphs) {
    if (!para) {
      wrappedLines.push('');
      continue;
    }
    // Lines break at spaces and after hyphens and slashes, as on Android and the web.
    const tokens = breakTokens(para);
    let currentLine = '';
    for (const { text: word, space } of tokens) {
      const candidate = currentLine ? `${currentLine}${space ? ' ' : ''}${word}` : word;
      if (widthOf(candidate) <= limitW + 0.5 || !currentLine) {
        currentLine = candidate;
      } else {
        wrappedLines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) wrappedLines.push(currentLine);
  }

  const maxLines = num(props.numberOfLines);
  let truncated = false;
  let lineCount = wrappedLines.length;
  if (maxLines !== undefined && maxLines > 0 && lineCount > maxLines) {
    lineCount = maxLines;
    truncated = true;
  }

  // Also detect single-line overflow when a single unbreakable word exceeds limitW
  const longestLineW = Math.max(...wrappedLines.slice(0, lineCount).map((l) => widthOf(l)), 0);
  if (maxLines === 1 && longestLineW > limitW + 4) {
    truncated = true;
  }
  // A single word wider than the line cannot wrap: it is clipped (web) or broken mid-word (Android).
  const wordOverflow = limitW !== Infinity && breakTokens(text).some(({ text: word }) => widthOf(word) > limitW + 4);

  const width = Math.min(longestLineW, limitW);
  const height = Math.max(lineHeight, lineCount * lineHeight);
  return { width: Math.ceil(width), height: Math.ceil(height), truncated, wordOverflow };
}

/**
 * Text size, honouring adjustsFontSizeToFit: Android shrinks the font until the text fits its lines
 * (iOS stops at minimumFontScale), so such text is only cut when even the smallest size does not fit.
 */
function measureText(
  text: string,
  style: FlatStyle,
  props: Record<string, any>,
  maxWidth: number | undefined,
  fontScale: number
): { width: number; height: number; truncated: boolean; wordOverflow: boolean } {
  const first = measureTextOnce(text, style, props, maxWidth, fontScale);
  if (!props.adjustsFontSizeToFit || (!first.truncated && !first.wordOverflow)) return first;
  const floor = num(props.minimumFontScale) ?? 0.5;
  const base = num(style.fontSize) ?? 14;
  for (let f = 0.95; f >= floor - 1e-6; f -= 0.05) {
    const lh = num(style.lineHeight);
    const next = measureTextOnce(text, { ...style, fontSize: base * f, ...(lh !== undefined ? { lineHeight: lh } : {}) }, props, maxWidth, fontScale);
    if (!next.truncated && !next.wordOverflow) return next;
  }
  return measureTextOnce(text, { ...style, fontSize: base * floor }, props, maxWidth, fontScale);
}

interface InternalNode {
  id: string;
  testId: string | null;
  label: string | null;
  parentId: string | null;
  type: string;
  role: AuditNodeRole;
  props: Record<string, any>;
  style: FlatStyle;
  text: string | null;
  interactive: boolean;
  visible: boolean;
  scrollable: boolean;
  scrollAxis: 'vertical' | 'horizontal' | 'both' | null;
  hitSlop: AuditHitSlop | null;
  zLayer: number;
  children: InternalNode[];
  // Computed layout
  bounds: AuditBounds;
  clipped: boolean;
  textTruncated: boolean;
  textOverflow?: 'word' | null;
}

function classifyRole(type: string, props: Record<string, any>, interactive: boolean): AuditNodeRole {
  if (type === 'Text' || type === 'RCTText') return 'text';
  if (type === 'TextInput' || type === 'RCTSinglelineTextInputView' || type === 'RCTMultilineTextInputView') {
    return 'input';
  }
  if (type === 'Image' || type === 'RCTImageView') return 'image';
  if (type === 'RCTScrollView' || type === 'ScrollView' || type === 'VirtualizedList' || type === 'FlatList') {
    return 'scroll_container';
  }
  if (type === 'Modal') return 'overlay';
  if (type.startsWith('RNSVG') || type === 'Svg' || props.accessibilityRole === 'image') {
    return 'icon';
  }
  if (interactive || props.accessibilityRole === 'button' || props.accessibilityRole === 'tab') {
    return 'button';
  }
  return 'container';
}

function isInteractiveNode(type: string, props: Record<string, any>): boolean {
  if (type === 'TextInput' || type === 'RCTSwitch' || type === 'Switch') return true;
  if (typeof props.onPress === 'function' || typeof props.onLongPress === 'function') return true;
  if (typeof props.onChangeText === 'function' || typeof props.onValueChange === 'function') return true;
  const r = props.accessibilityRole;
  if (r === 'button' || r === 'link' || r === 'switch' || r === 'checkbox' || r === 'radio' || r === 'tab') {
    return true;
  }
  return false;
}

function buildInternalTree(
  raw: RNJsonNode,
  parentId: string | null,
  parentZLayer: number,
  counter: { n: number },
  insideInteractive = false
): InternalNode | null {
  const props = raw.props || {};
  const style = flattenStyle(props.style);

  if (style.display === 'none') return null;
  if (raw.type === 'Modal' && props.visible === false) return null;

  const id = `n_${counter.n++}`;
  const testId = typeof props.testID === 'string' && props.testID.length > 0 ? props.testID : null;
  // A control hidden from accessibility inside a larger touch target (a switch drawn in a row that
  // toggles it) is part of that target, not a target of its own.
  const interactive = isInteractiveNode(raw.type, props) && !(insideInteractive && props.accessible === false);
  const role = classifyRole(raw.type, props, interactive);
  const scrollable = role === 'scroll_container';
  const scrollAxis = scrollable ? (props.horizontal ? 'horizontal' : 'vertical') : null;
  const visible = style.opacity !== 0;

  let zLayer = parentZLayer;
  if (raw.type === 'Modal') {
    zLayer = parentZLayer + 100;
  } else if (typeof style.zIndex === 'number' && style.zIndex !== 0) {
    zLayer = style.zIndex;
  } else if (style.position === 'absolute' && (style.elevation || style.zIndex)) {
    zLayer = Math.max(parentZLayer, Number(style.zIndex || 1));
  }

  let text: string | null = null;
  const children: InternalNode[] = [];

  if (role === 'text') {
    text = extractTextContent(raw);
  } else if (role === 'input') {
    text = typeof props.value === 'string' ? props.value : typeof props.placeholder === 'string' ? props.placeholder : null;
  } else if (raw.type === 'RNSVGSvgView' || raw.type === 'Svg') {
    // SVG icons are opaque vector leaves; do not lay out internal paths/groups as Flexbox nodes.
  } else if (Array.isArray(raw.children)) {
    for (const child of raw.children) {
      if (child && typeof child === 'object' && typeof child.type === 'string') {
        const built = buildInternalTree(child, id, zLayer, counter, insideInteractive || interactive);
        if (built) children.push(built);
      }
    }
  }

  // Merge ScrollView contentContainerStyle onto its single child wrapper if present
  if (scrollable && children.length === 1) {
    if (props.contentContainerStyle) {
      Object.assign(children[0].style, flattenStyle(props.contentContainerStyle));
    }
    if (scrollAxis === 'horizontal' && !children[0].style.flexDirection) {
      children[0].style.flexDirection = 'row';
    }
  }

  const rawLabel = props.accessibilityLabel ?? props['aria-label'];
  const label = typeof rawLabel === 'string' && rawLabel.length > 0 ? rawLabel : null;

  return {
    id,
    testId,
    label,
    parentId,
    type: raw.type,
    role,
    props,
    style,
    text,
    interactive,
    visible,
    scrollable,
    scrollAxis,
    hitSlop: normalizeHitSlop(props.hitSlop),
    zLayer,
    children,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    clipped: false,
    textTruncated: false,
  };
}

function clamp(val: number, minV: number | undefined, maxV: number | undefined): number {
  let v = val;
  if (minV !== undefined && v < minV) v = minV;
  if (maxV !== undefined && v > maxV) v = maxV;
  return v;
}

function layoutNode(
  node: InternalNode,
  availW: number | undefined,
  availH: number | undefined,
  originX: number,
  originY: number,
  viewport: AuditViewport,
  isRoot = false,
  stretchW = false,
  stretchH = false,
  /** Final pass: the size the parent already resolved (availW/availH are then the parent's inner box). */
  fixed?: { width: number; height: number }
): { width: number; height: number } {
  const s = node.style;
  const pad = getEdges(s, 'padding');
  const border = getBorders(s);

  const explicitW = resolveDim(s.width, availW);
  const explicitH = resolveDim(s.height, availH);
  const minW = fixed ? undefined : resolveDim(s.minWidth, availW);
  const maxW = fixed ? undefined : resolveDim(s.maxWidth, availW);
  const minH = fixed ? undefined : resolveDim(s.minHeight, availH);
  const maxH = fixed ? undefined : resolveDim(s.maxHeight, availH);

  let width = isRoot ? viewport.width : fixed ? fixed.width : explicitW ?? (stretchW && availW !== undefined ? availW : undefined);
  let height = isRoot ? viewport.height : fixed ? fixed.height : explicitH ?? (stretchH && availH !== undefined ? availH : undefined);

  if (node.type === 'Modal') {
    width = viewport.width;
    height = viewport.height;
    originX = 0;
    originY = 0;
  }

  // Aspect ratio derivation
  const aspect = num(s.aspectRatio);
  if (aspect && aspect > 0) {
    if (width !== undefined && height === undefined) height = width / aspect;
    else if (height !== undefined && width === undefined) width = height * aspect;
  }

  // Leaf intrinsic sizing
  if (node.role === 'text') {
    const innerMaxW =
      width !== undefined
        ? Math.max(0, width - pad.left - pad.right - border.left - border.right)
        : maxW !== undefined || availW !== undefined
          ? // maxWidth caps the text, but it still wraps inside the space it is given.
            Math.max(0, Math.min(maxW ?? Infinity, availW ?? Infinity) - pad.left - pad.right - border.left - border.right)
          : undefined;
    const measured = measureText(node.text || '', s, node.props, innerMaxW, viewport.fontScale);
    node.textTruncated = measured.truncated;
    node.textOverflow = measured.wordOverflow ? 'word' : null;
    const w = clamp(
      width ?? measured.width + pad.left + pad.right + border.left + border.right,
      minW,
      maxW
    );
    const h = clamp(
      height ?? measured.height + pad.top + pad.bottom + border.top + border.bottom,
      minH,
      maxH
    );
    node.bounds = { x: originX, y: originY, width: w, height: h };
    return { width: w, height: h };
  }

  if (node.role === 'input') {
    const baseFont = num(s.fontSize) ?? 15;
    const lineH = Math.ceil(baseFont * viewport.fontScale * 1.4);
    const fallbackW = stretchW && availW !== undefined ? availW : minW ?? 80;
    const w = clamp(width ?? fallbackW, minW, maxW);
    const h = clamp(height ?? lineH + pad.top + pad.bottom + border.top + border.bottom + 8, minH, maxH);
    node.bounds = { x: originX, y: originY, width: w, height: h };
    return { width: w, height: h };
  }

  // Native switches have no children to measure: use the platform's size (Material 3: 52 x 32 dp).
  if ((node.type === 'RCTSwitch' || node.type === 'AndroidSwitch') && node.children.length === 0) {
    const w = clamp(width ?? 52, minW, maxW);
    const h = clamp(height ?? 32, minH, maxH);
    node.bounds = { x: originX, y: originY, width: w, height: h };
    return { width: w, height: h };
  }

    if (node.role === 'icon' && node.children.length === 0) {
    const propW = num(node.props.width) ?? num(node.props.size);
    const propH = num(node.props.height) ?? num(node.props.size);
    const w = clamp(explicitW ?? propW ?? 24, minW, maxW);
    const h = clamp(explicitH ?? propH ?? 24, minH, maxH);
    node.bounds = { x: originX, y: originY, width: w, height: h };
    return { width: w, height: h };
  }

  if (node.role === 'image' && node.children.length === 0) {
    const w = clamp(width ?? availW ?? 48, minW, maxW);
    const h = clamp(height ?? (aspect ? w / aspect : 48), minH, maxH);
    node.bounds = { x: originX, y: originY, width: w, height: h };
    return { width: w, height: h };
  }

  // Container layout
  const dir: string = s.flexDirection || 'column';
  const isRow = dir === 'row' || dir === 'row-reverse';
  const isReverse = dir === 'row-reverse' || dir === 'column-reverse';
  const alignItems: string = s.alignItems || 'stretch';
  const justifyContent: string = s.justifyContent || 'flex-start';
  const flexWrap: string = s.flexWrap || 'nowrap';
  const gapAll = num(s.gap) ?? 0;
  const mainGap = (isRow ? num(s.columnGap) : num(s.rowGap)) ?? gapAll;
  const crossGap = (isRow ? num(s.rowGap) : num(s.columnGap)) ?? gapAll;

  const containerW = width !== undefined ? clamp(width, minW, maxW) : availW !== undefined ? clamp(availW, minW, maxW) : undefined;
  const containerH = height !== undefined ? clamp(height, minH, maxH) : undefined;

  const innerAvailW =
    containerW !== undefined ? Math.max(0, containerW - pad.left - pad.right - border.left - border.right) : undefined;
  const innerAvailH =
    containerH !== undefined
      ? Math.max(0, containerH - pad.top - pad.bottom - border.top - border.bottom)
      : availH !== undefined && !node.scrollable
        ? Math.max(0, availH - pad.top - pad.bottom - border.top - border.bottom)
        : undefined;

  const flowChildren = node.children.filter((c) => c.style.position !== 'absolute');
  const absChildren = node.children.filter((c) => c.style.position === 'absolute');

  const orderedFlow = isReverse ? [...flowChildren].reverse() : flowChildren;

  const scrollMain = node.scrollable && (isRow ? node.scrollAxis === 'horizontal' : node.scrollAxis === 'vertical');

  // ScrollView lets its children expand along the scroll axis
  const childAvailW = node.scrollable && node.scrollAxis === 'horizontal' ? undefined : innerAvailW;
  const childAvailH = node.scrollable && node.scrollAxis === 'vertical' ? undefined : innerAvailH;

  // Step 1: Measure each flow child's base size
  interface MeasuredChild {
    child: InternalNode;
    margin: { top: number; right: number; bottom: number; left: number };
    flexGrow: number;
    flexShrink: number;
    baseMain: number;
    baseCross: number;
    finalW: number;
    finalH: number;
    childStretchW: boolean;
    childStretchH: boolean;
  }

  const measured: MeasuredChild[] = orderedFlow.map((child) => {
    const cs = child.style;
    const m = getEdges(cs, 'margin');
    const flexNum = num(cs.flex);
    const isScroll = child.role === 'scroll_container';
    const isVerticalScroll = isScroll && child.scrollAxis === 'vertical';
    const flexGrow =
      num(cs.flexGrow) ??
      (flexNum !== undefined && flexNum > 0 ? flexNum : isVerticalScroll && cs.height === undefined && !isRow ? 1 : 0);
    const flexShrink =
      num(cs.flexShrink) ??
      (flexNum !== undefined && flexNum > 0 ? 1 : isScroll ? 1 : 0);

    const alignSelf = cs.alignSelf || alignItems;
    // Stretch fills the container's cross size; in a wrapping container the cross size belongs to each
    // line, which is not known yet, so wrapped items keep their content size.
    const singleLine = flexWrap !== 'wrap';
    const childStretchW = singleLine && !isRow && alignSelf === 'stretch' && cs.width === undefined && childAvailW !== undefined && width !== undefined;
    const childStretchH = singleLine && isRow && alignSelf === 'stretch' && cs.height === undefined && childAvailH !== undefined && height !== undefined;

    const cAvailW =
      childAvailW !== undefined ? Math.max(0, childAvailW - m.left - m.right) : undefined;
    const cAvailH =
      childAvailH !== undefined ? Math.max(0, childAvailH - m.top - m.bottom) : undefined;

    let size: { width: number; height: number };
    // A column whose height is auto (content-sized) has no definite main size, even when space is
    // available above it: Yoga sizes its flex: 1 children to their content, not to the space left.
    // Along a ScrollView's scroll axis the content is never limited by the ScrollView's size.
    const definiteMain = scrollMain ? false : isRow ? width !== undefined || availW !== undefined : height !== undefined;
    // Only the `flex: n` shorthand sets flexBasis 0; flexGrow alone keeps flexBasis auto (the content size).
    const zeroBasis = (flexNum !== undefined && flexNum > 0) || (isVerticalScroll && !isRow && cs.flexGrow === undefined);
    if (flexGrow > 0 && zeroBasis && cs.flexBasis === undefined && (isRow ? cs.width === undefined : cs.height === undefined) && definiteMain) {
      // flex: 1 uses flexBasis = 0 along the main axis; defer final measurement until freeSpace is distributed.
      size = {
        width: isRow ? 0 : childStretchW && cAvailW !== undefined ? cAvailW : 0,
        height: !isRow ? 0 : childStretchH && cAvailH !== undefined ? cAvailH : 0,
      };
    } else {
      // A vertical ScrollView that does not grow (flexGrow: 0, e.g. a footer) is as tall as its content,
      // then shrinks like any flex item if that does not fit.
      size = layoutNode(child, cAvailW, cAvailH, 0, 0, viewport, false, childStretchW, childStretchH);
    }

    // A flex item never gets smaller than its minWidth/minHeight, including when lines are broken.
    const minMain = resolveDim(isRow ? cs.minWidth : cs.minHeight, isRow ? childAvailW : childAvailH) ?? 0;
    // flexBasis (dp or a percentage of the container) replaces the content size along the main axis.
    const basis = cs.flexBasis === 'auto' ? undefined : resolveDim(cs.flexBasis, isRow ? childAvailW : childAvailH);
    if (basis !== undefined) {
      if (isRow) size = { ...size, width: basis };
      else size = { ...size, height: basis };
    }

    return {
      child,
      margin: m,
      flexGrow,
      flexShrink,
      baseMain: Math.max(isRow ? size.width : size.height, minMain),
      baseCross: isRow ? size.height : size.width,
      finalW: size.width,
      finalH: size.height,
      childStretchW,
      childStretchH,
    };
  });

  // Step 2: Partition into flex lines (support flexWrap)
  // Column main size: the container's own height when it has one; an auto height only caps (maxHeight).
  const autoColumnCap =
    maxH !== undefined ? Math.max(0, maxH - pad.top - pad.bottom - border.top - border.bottom) : undefined;
  const mainLimit = isRow ? innerAvailW : containerH !== undefined ? innerAvailH : autoColumnCap;
  const growAllowed = isRow || containerH !== undefined;
  // In a ScrollView, content with flexGrow fills at least the visible area but is never shrunk to it.
  const noShrink = scrollMain;
  const lines: MeasuredChild[][] = [];
  if (flexWrap === 'wrap' && mainLimit !== undefined && measured.length > 0) {
    let curLine: MeasuredChild[] = [];
    let curMain = 0;
    for (const item of measured) {
      const itemOuterMain = item.baseMain + (isRow ? item.margin.left + item.margin.right : item.margin.top + item.margin.bottom);
      const nextMain = curLine.length === 0 ? itemOuterMain : curMain + mainGap + itemOuterMain;
      if (curLine.length > 0 && nextMain > mainLimit + 0.01) {
        lines.push(curLine);
        curLine = [item];
        curMain = itemOuterMain;
      } else {
        curLine.push(item);
        curMain = nextMain;
      }
    }
    if (curLine.length > 0) lines.push(curLine);
  } else {
    lines.push(measured);
  }

  // Step 3: Resolve flexGrow / flexShrink per line and position children
  const contentStartX = originX + border.left + pad.left;
  const contentStartY = originY + border.top + pad.top;

  let totalCrossUsed = 0;
  let maxMainUsed = 0;

  const lineMetrics = lines.map((line) => {
    const totalGaps = Math.max(0, line.length - 1) * mainGap;
    let sumBaseMain = totalGaps;
    let sumGrow = 0;
    let sumShrink = 0;
    for (const item of line) {
      const mMain = isRow ? item.margin.left + item.margin.right : item.margin.top + item.margin.bottom;
      sumBaseMain += item.baseMain + mMain;
      sumGrow += item.flexGrow;
      // Yoga shrinks in proportion to flexShrink times the base size.
      sumShrink += item.flexShrink * item.baseMain;
    }

    const rawFree = mainLimit !== undefined ? mainLimit - sumBaseMain : 0;
    const freeSpace = noShrink ? Math.max(0, rawFree) : rawFree;
    for (const item of line) {
      let resolvedMain = item.baseMain;
      if (freeSpace > 0 && growAllowed && sumGrow > 0 && item.flexGrow > 0) {
        resolvedMain += (freeSpace * item.flexGrow) / sumGrow;
      } else if (freeSpace < 0 && sumShrink > 0 && item.flexShrink > 0) {
        const cs = item.child.style;
        const minMain = resolveDim(isRow ? cs.minWidth : cs.minHeight, isRow ? childAvailW : childAvailH) ?? 0;
        resolvedMain = Math.max(minMain, resolvedMain + (freeSpace * item.flexShrink * item.baseMain) / sumShrink);
      }
      if (isRow) {
        item.finalW = resolvedMain;
      } else {
        item.finalH = resolvedMain;
      }
    }

    // Re-layout any flex-resized children so their descendants use the exact allocated main size
    let lineCross = 0;
    let lineMain = totalGaps;
    for (const item of line) {
      const mCross = isRow ? item.margin.top + item.margin.bottom : item.margin.left + item.margin.right;
      const mMain = isRow ? item.margin.left + item.margin.right : item.margin.top + item.margin.bottom;

      const hasBasis = item.child.style.flexBasis !== undefined && item.child.style.flexBasis !== 'auto';
      if (hasBasis || (item.flexGrow > 0 && (growAllowed || freeSpace < 0)) || (freeSpace < 0 && item.flexShrink > 0)) {
        const re = layoutNode(
          item.child,
          isRow ? item.finalW : childAvailW !== undefined ? Math.max(0, childAvailW - mCross) : undefined,
          !isRow ? item.finalH : childAvailH !== undefined ? Math.max(0, childAvailH - mCross) : undefined,
          0,
          0,
          viewport,
          false,
          isRow ? true : item.childStretchW,
          !isRow ? true : item.childStretchH
        );
        if (isRow) {
          item.finalW = Math.max(0, item.finalW);
          item.finalH = re.height;
        } else {
          item.finalH = Math.max(0, item.finalH);
          item.finalW = re.width;
        }
      }

      const cCross = (isRow ? item.finalH : item.finalW) + mCross;
      const cMain = (isRow ? item.finalW : item.finalH) + mMain;
      if (cCross > lineCross) lineCross = cCross;
      lineMain += cMain;
    }

    if (lineMain > maxMainUsed) maxMainUsed = lineMain;
    return { line, lineMain, lineCross };
  });

  totalCrossUsed =
    lineMetrics.reduce((acc, lm) => acc + lm.lineCross, 0) +
    Math.max(0, lineMetrics.length - 1) * crossGap;

  // Final container dimensions
  const finalW = clamp(
    width ??
      (isRoot
        ? viewport.width
        : (isRow ? maxMainUsed : totalCrossUsed) + pad.left + pad.right + border.left + border.right),
    minW,
    maxW
  );
  const finalH = clamp(
    height ??
      (isRoot
        ? viewport.height
        : (isRow ? totalCrossUsed : maxMainUsed) + pad.top + pad.bottom + border.top + border.bottom),
    minH,
    maxH
  );

  node.bounds = { x: originX, y: originY, width: finalW, height: finalH };

  const innerFinalW = Math.max(0, finalW - pad.left - pad.right - border.left - border.right);
  const innerFinalH = Math.max(0, finalH - pad.top - pad.bottom - border.top - border.bottom);

  // Step 4: Final positioning of each child in window coordinates
  let crossCursor = 0;
  for (const { line, lineMain, lineCross } of lineMetrics) {
    const lineCrossSize = lines.length === 1 ? (isRow ? innerFinalH : innerFinalW) : lineCross;
    const availMain = isRow ? innerFinalW : innerFinalH;
    const leftover = Math.max(0, availMain - lineMain);

    let mainCursor = 0;
    let extraGap = 0;
    if (justifyContent === 'flex-end') mainCursor = leftover;
    else if (justifyContent === 'center') mainCursor = leftover / 2;
    else if (justifyContent === 'space-between' && line.length > 1) {
      extraGap = leftover / (line.length - 1);
    } else if (justifyContent === 'space-around' && line.length > 0) {
      extraGap = leftover / line.length;
      mainCursor = extraGap / 2;
    } else if (justifyContent === 'space-evenly' && line.length > 0) {
      extraGap = leftover / (line.length + 1);
      mainCursor = extraGap;
    }

    for (let idx = 0; idx < line.length; idx++) {
      const item = line[idx];
      const cs = item.child.style;
      const alignSelf = cs.alignSelf || alignItems;
      const m = item.margin;

      const childW = item.finalW;
      const childH = item.finalH;

      let cx: number;
      let cy: number;
      if (isRow) {
        cx = contentStartX + mainCursor + m.left;
        let crossOffset = 0;
        if (alignSelf === 'flex-end') crossOffset = Math.max(0, lineCrossSize - childH - m.top - m.bottom);
        else if (alignSelf === 'center') crossOffset = Math.max(0, (lineCrossSize - childH - m.top - m.bottom) / 2);
        cy = contentStartY + crossCursor + crossOffset + m.top;
        mainCursor += childW + m.left + m.right + mainGap + extraGap;
      } else {
        cy = contentStartY + mainCursor + m.top;
        let crossOffset = 0;
        if (alignSelf === 'flex-end') crossOffset = Math.max(0, lineCrossSize - childW - m.left - m.right);
        else if (alignSelf === 'center') crossOffset = Math.max(0, (lineCrossSize - childW - m.left - m.right) / 2);
        cx = contentStartX + crossCursor + crossOffset + m.left;
        mainCursor += childH + m.top + m.bottom + mainGap + extraGap;
      }

      // Final layout pass at exact window coordinates, at the size resolved above. The parent's inner box
      // is passed as the available space, so percentages inside resolve the way they did when measuring.
      layoutNode(item.child, innerFinalW, innerFinalH, cx, cy, viewport, false, false, false, { width: childW, height: childH });
      if (isRow && item.flexGrow > 0) item.child.bounds.width = childW;
      if (!isRow && item.flexGrow > 0) item.child.bounds.height = childH;
    }

    crossCursor += lineCross + crossGap;
  }

  // Step 5: Position absolute children relative to this container's padding box
  for (const abs of absChildren) {
    const as = abs.style;
    const top = resolveDim(as.top, finalH);
    const bottom = resolveDim(as.bottom, finalH);
    const left = resolveDim(as.left, finalW);
    const right = resolveDim(as.right, finalW);
    const wFromLR = left !== undefined && right !== undefined ? Math.max(0, finalW - left - right) : undefined;
    const hFromTB = top !== undefined && bottom !== undefined ? Math.max(0, finalH - top - bottom) : undefined;

    const absW = resolveDim(as.width, finalW) ?? wFromLR;
    const absH = resolveDim(as.height, finalH) ?? hFromTB;

    const measuredAbs = layoutNode(abs, absW ?? finalW, absH ?? finalH, originX, originY, viewport, false, absW !== undefined, absH !== undefined);
    const rw = absW ?? measuredAbs.width;
    const rh = absH ?? measuredAbs.height;

    let ax = originX;
    if (left !== undefined) ax = originX + left;
    else if (right !== undefined) ax = originX + finalW - right - rw;

    let ay = originY;
    if (top !== undefined) ay = originY + top;
    else if (bottom !== undefined) ay = originY + finalH - bottom - rh;

    layoutNode(abs, rw, rh, ax, ay, viewport, false, absW !== undefined, absH !== undefined);
  }

  return { width: finalW, height: finalH };
}

function flattenToAuditNodes(node: InternalNode, out: AuditNode[]) {
  out.push({
    id: node.id,
    testId: node.testId,
    ...(node.label ? { label: node.label } : {}),
    parentId: node.parentId,
    role: node.role,
    text: node.text,
    bounds: {
      x: Math.round(node.bounds.x * 10) / 10,
      y: Math.round(node.bounds.y * 10) / 10,
      width: Math.round(node.bounds.width * 10) / 10,
      height: Math.round(node.bounds.height * 10) / 10,
    },
    interactive: node.interactive,
    visible: node.visible,
    scrollable: node.scrollable,
    ...(node.scrollAxis ? { scrollAxis: node.scrollAxis } : {}),
    ...(node.hitSlop ? { hitSlop: node.hitSlop } : {}),
    clipped: node.clipped,
    textTruncated: node.textTruncated,
    ...(node.textOverflow ? { textOverflow: node.textOverflow } : {}),
    zLayer: node.zLayer,
  });

  for (const child of node.children) {
    flattenToAuditNodes(child, out);
  }
}

/**
 * Convert a react-test-renderer JSON tree into a standardized AuditSnapshot.
 */
/** A rendered view that measures itself, with the box the solver gave it (to replay onLayout). */
export interface LayoutCallback {
  onLayout: (event: { nativeEvent: { layout: AuditBounds } }) => void;
  layout: AuditBounds;
}

function collectLayoutCallbacks(node: InternalNode, out: LayoutCallback[]) {
  if (typeof node.props.onLayout === 'function') {
    // onLayout reports the box relative to the parent, as React Native does.
    out.push({ onLayout: node.props.onLayout, layout: { x: 0, y: 0, width: node.bounds.width, height: node.bounds.height } });
  }
  for (const child of node.children) collectLayoutCallbacks(child, out);
}

export function extractSnapshotFromRNTree(
  tree: RNJsonNode | RNJsonNode[] | null,
  meta: { screen: string; state: string; profile: string; viewport: AuditViewport },
  layoutCallbacks?: LayoutCallback[]
): AuditSnapshot {
  const rootJson: RNJsonNode = Array.isArray(tree)
    ? { type: 'View', props: { style: { flex: 1 } }, children: tree }
    : tree || { type: 'View', props: { style: { flex: 1 } }, children: [] };

  const counter = { n: 0 };
  const rootInternal = buildInternalTree(rootJson, null, 0, counter);
  const nodes: AuditNode[] = [];

  if (rootInternal) {
    layoutNode(rootInternal, meta.viewport.width, meta.viewport.height, 0, 0, meta.viewport, true);
    flattenToAuditNodes(rootInternal, nodes);
    if (layoutCallbacks) collectLayoutCallbacks(rootInternal, layoutCallbacks);
  }

  return {
    screen: meta.screen,
    state: meta.state,
    profile: meta.profile,
    viewport: meta.viewport,
    nodes,
  };
}
