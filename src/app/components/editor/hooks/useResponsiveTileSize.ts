'use client';

import { useEffect, useState } from 'react';

import {
  BOARD_HORIZONTAL_PADDING,
  DEFAULT_TILE_SIZE,
  MIN_TILE_SIZE,
} from '../constants';

export function useResponsiveTileSize(widthInTiles: number) {
  const [tileSize, setTileSize] = useState(DEFAULT_TILE_SIZE);

  useEffect(() => {
    const update = () => {
      setTileSize(
        Math.max(MIN_TILE_SIZE, Math.floor((window.innerWidth - BOARD_HORIZONTAL_PADDING) / widthInTiles))
      );
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [widthInTiles]);

  return tileSize;
}
