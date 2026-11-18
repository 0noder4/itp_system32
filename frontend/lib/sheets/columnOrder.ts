/** Reorder sheet columns. Index 0 stays pinned (company / row name). */

export function applyColumnOrder<T extends { key: string }>(columns: T[], order: string[]): T[] {
  if (columns.length <= 1 || order.length === 0) return columns;
  const pinned = columns[0];
  const rest = columns.slice(1);
  const byKey = new Map(rest.map((col) => [col.key, col]));
  const used = new Set<string>();
  const ordered: T[] = [];
  for (const key of order) {
    if (key === pinned.key || used.has(key)) continue;
    const col = byKey.get(key);
    if (!col) continue;
    ordered.push(col);
    used.add(key);
  }
  for (const col of rest) {
    if (!used.has(col.key)) ordered.push(col);
  }
  return [pinned, ...ordered];
}

/** Move `fromKey` to the index currently occupied by `toKey`. */
export function reorderColumnKeys(order: string[], fromKey: string, toKey: string): string[] {
  if (fromKey === toKey) return order;
  const from = order.indexOf(fromKey);
  const to = order.indexOf(toKey);
  if (from < 0 || to < 0) return order;
  const next = order.slice();
  next.splice(from, 1);
  next.splice(to, 0, fromKey);
  return next;
}

/** Move a contiguous block so it starts at `beforeKey`. No-op if the target is inside the block. */
export function moveColumnBlock(order: string[], block: string[], beforeKey: string): string[] {
  if (block.length === 0 || block.includes(beforeKey)) return order;
  const blockSet = new Set(block);
  const rest = order.filter((key) => !blockSet.has(key));
  const index = rest.indexOf(beforeKey);
  if (index < 0) return order;
  rest.splice(index, 0, ...block);
  return rest;
}
