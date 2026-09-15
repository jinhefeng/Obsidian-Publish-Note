export function normalizeLinkedPageDepth(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function shouldFollowLinkedPage(depth: number, maxDepth: number): boolean {
  return maxDepth > 0 && depth < maxDepth;
}
