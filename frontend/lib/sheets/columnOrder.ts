/** Reorder sheet columns and override column categories. Index 0 stays pinned (company / row name). */

function sameGroup(a?: string, b?: string): boolean {
  const ga = (a ?? "").trim();
  const gb = (b ?? "").trim();
  if (!ga || !gb) return false;
  if (ga === gb) return true;
  const ba = ga.split(" · ")[0]?.trim() ?? "";
  const bb = gb.split(" · ")[0]?.trim() ?? "";
  return Boolean(ba && ba === bb);
}

export function applyColumnGroupOverrides<T extends { key: string; group: string }>(
  columns: T[],
  overrides: Record<string, string>
): T[] {
  if (columns.length <= 1 || !overrides || Object.keys(overrides).length === 0) return columns;
  return columns.map((col, index) => {
    if (index === 0) return col;
    if (!Object.prototype.hasOwnProperty.call(overrides, col.key)) return col;
    const nextGroup = overrides[col.key] ?? "";
    if (nextGroup === col.group) return col;
    return { ...col, group: nextGroup };
  });
}

export function applyColumnOrder<T extends { key: string; group?: string }>(
  columns: T[],
  order: string[]
): T[] {
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
  const existingKeys = new Set(ordered.map((col) => col.key));
  for (const col of rest) {
    if (used.has(col.key)) continue;
    const existingIdx = ordered.findIndex(
      (item) => existingKeys.has(item.key) && sameGroup(item.group, col.group)
    );
    if (existingIdx >= 0) {
      ordered.splice(existingIdx, 0, col);
    } else {
      let lastGroupIdx = -1;
      for (let i = ordered.length - 1; i >= 0; i -= 1) {
        if (sameGroup(ordered[i]?.group, col.group)) {
          lastGroupIdx = i;
          break;
        }
      }
      if (lastGroupIdx >= 0) ordered.splice(lastGroupIdx + 1, 0, col);
      else ordered.push(col);
    }
    used.add(col.key);
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

/** Move `fromKey` immediately before or after `toKey`. */
export function moveColumnRelative(
  order: string[],
  fromKey: string,
  toKey: string,
  placement: "before" | "after"
): string[] {
  if (fromKey === toKey) return order;
  if (!order.includes(fromKey) || !order.includes(toKey)) return order;
  const rest = order.filter((key) => key !== fromKey);
  const toIdx = rest.indexOf(toKey);
  if (toIdx < 0) return order;
  const insertAt = placement === "after" ? toIdx + 1 : toIdx;
  rest.splice(insertAt, 0, fromKey);
  if (rest.length === order.length && rest.every((k, i) => k === order[i])) return order;
  return rest;
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

/** Move a contiguous block immediately before or after `toKey`. */
export function moveColumnBlockRelative(
  order: string[],
  block: string[],
  toKey: string,
  placement: "before" | "after"
): string[] {
  if (block.length === 0 || block.includes(toKey)) return order;
  const blockSet = new Set(block);
  const orderedBlock = order.filter((key) => blockSet.has(key));
  if (orderedBlock.length === 0) return order;
  const rest = order.filter((key) => !blockSet.has(key));
  const toIdx = rest.indexOf(toKey);
  if (toIdx < 0) return order;
  const insertAt = placement === "after" ? toIdx + 1 : toIdx;
  rest.splice(insertAt, 0, ...orderedBlock);
  if (rest.length === order.length && rest.every((k, i) => k === order[i])) return order;
  return rest;
}
