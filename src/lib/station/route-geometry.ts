import {
  getPieceAnchor as findPieceAnchor,
  getPieceCells as findPieceCells,
  parseCellRef,
  type StationLayout,
} from './layout';

const searchGeometry = new WeakMap<StationLayout, Map<string, [number, number][]>>();

/** A fresh view for one synchronous search, including when the editor mutates its layout. */
export function indexRouteGeometry(layout: StationLayout): StationLayout {
  const view = { ...layout };
  const cellsByPiece = new Map<string, [number, number][]>();
  layout.map.forEach((row, y) =>
    row.forEach((cell, x) => {
      const { pieceId } = parseCellRef(cell);
      let cells = cellsByPiece.get(pieceId);
      if (!cells) {
        cells = [];
        cellsByPiece.set(pieceId, cells);
      }
      cells.push([x, y]);
    }),
  );
  searchGeometry.set(view, cellsByPiece);
  return view;
}

export function getPieceCells(layout: StationLayout, pieceId: string): [number, number][] {
  const index = searchGeometry.get(layout);
  return index ? [...(index.get(pieceId) ?? [])] : findPieceCells(layout, pieceId);
}

export function getPieceAnchor(layout: StationLayout, pieceId: string) {
  const index = searchGeometry.get(layout);
  if (!index) return findPieceAnchor(layout, pieceId);
  const cells = index.get(pieceId) ?? [];
  return {
    x: Math.min(...cells.map(([x]) => x)),
    y: Math.min(...cells.map(([, y]) => y)),
  };
}
