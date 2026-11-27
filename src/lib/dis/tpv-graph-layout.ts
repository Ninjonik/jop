export type GraphPoint = { x: number; y: number };
export type GraphSegment = { from: GraphPoint; to: GraphPoint };

/** Test a foreign path against the number's rotated, padded text box. */
function crossesNumber(
  segment: GraphSegment,
  center: GraphPoint,
  angle: number,
  halfWidth: number,
) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const local = (p: GraphPoint) => ({
    x: (p.x - center.x) * c + (p.y - center.y) * s,
    y: -(p.x - center.x) * s + (p.y - center.y) * c,
  });
  const a = local(segment.from),
    b = local(segment.to);
  let lo = 0,
    hi = 1;
  for (const [start, end, min, max] of [
    [a.x, b.x, -halfWidth, halfWidth],
    [a.y, b.y, -31, -4],
  ]) {
    const delta = end - start;
    if (Math.abs(delta) < 1e-8) {
      if (start < min || start > max) return false;
      continue;
    }
    const t1 = (min - start) / delta,
      t2 = (max - start) / delta;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
    if (lo > hi) return false;
  }
  return true;
}
/** Prefer a clear position along the running line, rather than a fixed crossing midpoint. */
export function placeTrainNumber(
  from: GraphPoint,
  to: GraphPoint,
  obstacles: GraphSegment[],
  textWidth: number,
) {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    length = Math.hypot(dx, dy);
  let angle = Math.atan2(dy, dx);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  const margin = Math.min(0.5, (textWidth / 2 + 12) / Math.max(1, length));
  let best = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, angle: (angle * 180) / Math.PI },
    least = Infinity;
  for (const preferred of [0.36, 0.66, 0.2, 0.8, 0.5]) {
    const t = Math.max(margin, Math.min(1 - margin, preferred));
    const center = { x: from.x + dx * t, y: from.y + dy * t };
    const collisions = obstacles.filter((segment) =>
      crossesNumber(segment, center, angle, textWidth / 2 + 5),
    ).length;
    if (collisions < least) {
      least = collisions;
      best = { ...center, angle: (angle * 180) / Math.PI };
    }
    if (collisions === 0) break;
  }
  return best;
}
/** Keep the operating clock at roughly a third of the visible plot, leaving forecast room. */
export function followTimeScroll(timeX: number, viewportWidth: number) {
  return Math.max(0, timeX - 180 - Math.max(0, viewportWidth - 180) * 0.35);
}
