import type { SessionLineblockLink } from './domain';

export const networkCardWidth = 520;
export const networkCardHeight = 350;
const columnStep = networkCardWidth + 120;
const rowStep = networkCardHeight + 60;

/** Display-only layers from persisted links. Never used for railway traversal. */
export function arrangeStationNetwork(stationIds: string[], links: SessionLineblockLink[]) {
  const neighbors = new Map(stationIds.map((id) => [id, new Set<string>()]));
  for (const link of links) {
    if (link.a.stationId === link.b.stationId) continue;
    if (!neighbors.has(link.a.stationId) || !neighbors.has(link.b.stationId)) continue;
    neighbors.get(link.a.stationId)!.add(link.b.stationId);
    neighbors.get(link.b.stationId)!.add(link.a.stationId);
  }
  const positions = new Map<string, { x: number; y: number }>();
  const sections: { label: 'connected' | 'waiting'; y: number }[] = [];
  const visited = new Set<string>();
  let top = 50;
  let width = networkCardWidth + 48;
  const connectedIds = stationIds.filter((id) => neighbors.get(id)!.size > 0);
  // Starting at leaves gives ordinary chains a natural left-to-right arrangement.
  const roots = [...connectedIds.filter((id) => neighbors.get(id)!.size === 1), ...connectedIds];
  for (const root of roots) {
    if (visited.has(root)) continue;
    sections.push({ label: 'connected', y: top - 30 });
    const queue = [{ id: root, depth: 0 }];
    const rows = new Map<number, number>();
    let maxRows = 1;
    visited.add(root);
    for (let index = 0; index < queue.length; index++) {
      const { id, depth } = queue[index];
      const row = rows.get(depth) ?? 0;
      rows.set(depth, row + 1);
      maxRows = Math.max(maxRows, row + 1);
      const x = 24 + depth * columnStep;
      positions.set(id, { x, y: top + row * rowStep });
      width = Math.max(width, x + networkCardWidth + 24);
      for (const neighbor of neighbors.get(id)!) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push({ id: neighbor, depth: depth + 1 });
      }
    }
    top += maxRows * rowStep + 40;
  }
  const waiting = stationIds.filter((id) => neighbors.get(id)!.size === 0);
  if (waiting.length) {
    sections.push({ label: 'waiting', y: top - 30 });
    waiting.forEach((id, index) => {
      const x = 24 + (index % 3) * columnStep;
      positions.set(id, { x, y: top + Math.floor(index / 3) * rowStep });
      width = Math.max(width, x + networkCardWidth + 24);
    });
    top += Math.ceil(waiting.length / 3) * rowStep;
  }
  return { positions, sections, width, height: Math.max(top, 400) };
}
