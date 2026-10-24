/**
 * Progressions as a graph of exercises. A chain is an ordered list of steps (each step leads to the
 * next one); a link joins two exercises on its own. "Progression" and "prerequisite" point from the
 * easier or earlier exercise to the harder or later one; "variation" sits beside, with no direction.
 */
export type LinkKind = 'progression' | 'prerequisite' | 'variation';
export const LINK_KINDS: readonly LinkKind[] = ['progression', 'prerequisite', 'variation'];

export type GraphEdge = { from: string; to: string; kind: LinkKind };
export type StepRef = { chainId: string; exerciseId: string; position: number };

/** Each chain's consecutive steps as progression edges, in step order. */
export function chainEdges(steps: readonly StepRef[]): GraphEdge[] {
  const byChain = new Map<string, StepRef[]>();
  for (const step of steps) byChain.set(step.chainId, [...(byChain.get(step.chainId) ?? []), step]);
  const edges: GraphEdge[] = [];
  for (const list of byChain.values()) {
    const ordered = [...list].sort((a, b) => a.position - b.position);
    for (let index = 1; index < ordered.length; index += 1) edges.push({ from: ordered[index - 1].exerciseId, to: ordered[index].exerciseId, kind: 'progression' });
  }
  return edges;
}

const directed = (edge: GraphEdge) => edge.kind !== 'variation';

/**
 * A loop in the directed relations (progression and prerequisite), as the exercises along it with
 * the first one repeated at the end (A, B, A); null when there is none.
 */
export function findCycle(edges: readonly GraphEdge[]): string[] | null {
  const next = new Map<string, string[]>();
  for (const edge of edges.filter(directed)) next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  const state = new Map<string, 'open' | 'done'>();
  const path: string[] = [];
  const visit = (node: string): string[] | null => {
    state.set(node, 'open');
    path.push(node);
    for (const target of next.get(node) ?? []) {
      if (state.get(target) === 'open') return [...path.slice(path.indexOf(target)), target];
      if (!state.has(target)) {
        const found = visit(target);
        if (found) return found;
      }
    }
    path.pop();
    state.set(node, 'done');
    return null;
  };
  for (const node of next.keys()) {
    if (state.has(node)) continue;
    const found = visit(node);
    if (found) return found;
  }
  return null;
}

export type LinkProblem = { kind: 'self' } | { kind: 'duplicate' } | { kind: 'cycle'; path: string[] };

/** Why a new relation cannot be added to the graph, or null when it can. */
export function linkProblem(edges: readonly GraphEdge[], candidate: GraphEdge): LinkProblem | null {
  if (candidate.from === candidate.to) return { kind: 'self' };
  const same = (edge: GraphEdge) => edge.kind === candidate.kind && (
    (edge.from === candidate.from && edge.to === candidate.to)
    || (candidate.kind === 'variation' && edge.from === candidate.to && edge.to === candidate.from));
  if (edges.some(same)) return { kind: 'duplicate' };
  const path = findCycle([...edges, candidate]);
  return path ? { kind: 'cycle', path } : null;
}

export type TreeNode = {
  id: string;
  /** Steps away from the exercise the tree is built around (1 = right next to it). */
  depth: number;
  /** The neighbours it hangs from on the way to the centre; more than one when it sits under several. */
  via: string[];
};

export type ExerciseTree = {
  /** Easier exercises leading to this one, nearest first. */
  regressions: TreeNode[];
  /** Harder exercises it leads to, nearest first. */
  progressions: TreeNode[];
  /** Exercises needed before this one. */
  prerequisites: string[];
  /** Exercises it is needed for. */
  unlocks: string[];
  variations: string[];
};

function walk(start: string, neighbours: Map<string, string[]>): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  let frontier = [start];
  let depth = 0;
  const seen = new Set([start]);
  while (frontier.length > 0) {
    depth += 1;
    const nextFrontier: string[] = [];
    for (const node of frontier) {
      for (const other of neighbours.get(node) ?? []) {
        const known = nodes.get(other);
        if (known) {
          if (known.depth === depth && !known.via.includes(node)) known.via.push(node);
          continue;
        }
        if (seen.has(other)) continue;
        seen.add(other);
        nodes.set(other, { id: other, depth, via: [node] });
        nextFrontier.push(other);
      }
    }
    frontier = nextFrontier;
  }
  return [...nodes.values()].sort((a, b) => a.depth - b.depth);
}

/** Everything an exercise connects to: the easier ones below it, the harder ones above, and the side relations. */
export function exerciseTree(edges: readonly GraphEdge[], id: string): ExerciseTree {
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  for (const edge of edges.filter((item) => item.kind === 'progression')) {
    up.set(edge.from, [...(up.get(edge.from) ?? []), edge.to]);
    down.set(edge.to, [...(down.get(edge.to) ?? []), edge.from]);
  }
  const unique = (values: string[]) => [...new Set(values)].filter((value) => value !== id);
  return {
    regressions: walk(id, down),
    progressions: walk(id, up),
    prerequisites: unique(edges.filter((edge) => edge.kind === 'prerequisite' && edge.to === id).map((edge) => edge.from)),
    unlocks: unique(edges.filter((edge) => edge.kind === 'prerequisite' && edge.from === id).map((edge) => edge.to)),
    variations: unique(edges.filter((edge) => edge.kind === 'variation' && (edge.from === id || edge.to === id)).map((edge) => (edge.from === id ? edge.to : edge.from))),
  };
}

/**
 * The level of each exercise in the directed relations: 1 for one with nothing before it, otherwise one
 * more than the highest exercise leading to it (longest path, Kahn's order). Exercises in a loop get none.
 */
export function graphLevels(edges: readonly GraphEdge[]): Map<string, number> {
  const list = edges.filter(directed);
  const incoming = new Map<string, number>();
  const next = new Map<string, string[]>();
  for (const edge of list) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    if (!incoming.has(edge.from)) incoming.set(edge.from, incoming.get(edge.from) ?? 0);
    next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  }
  const level = new Map<string, number>();
  const queue = [...incoming.entries()].filter(([, count]) => count === 0).map(([node]) => node);
  queue.forEach((node) => level.set(node, 1));
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const target of next.get(node) ?? []) {
      level.set(target, Math.max(level.get(target) ?? 1, level.get(node)! + 1));
      const left = incoming.get(target)! - 1;
      incoming.set(target, left);
      if (left === 0) queue.push(target);
    }
  }
  for (const [node, count] of incoming) if (count > 0) level.delete(node);
  return level;
}
