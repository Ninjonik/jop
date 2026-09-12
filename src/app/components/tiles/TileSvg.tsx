'use client';

import { useLayoutEffect, useRef, type CSSProperties } from 'react';

import type {
  GroupSelection,
  PieceOrientation,
  StateGroupRegistry,
  TileData,
} from './tile-catalog';
import { resolveComponentStyles } from './tile-rendering';

interface TileSvgProps {
  tileKey: string;
  tile: TileData;
  stateGroups: StateGroupRegistry;
  selections: Record<string, GroupSelection>;
  textValues?: Record<string, string>;
  orientation?: PieceOrientation;
  className?: string;
  style?: CSSProperties;
}

function camelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function parseCssString(cssString: string): CSSProperties {
  const styles: Record<string, string> = {};
  if (!cssString) {
    return styles;
  }

  cssString.split(';').forEach((rule) => {
    const trimmed = rule.trim();
    if (!trimmed) {
      return;
    }

    const [property, ...valueParts] = trimmed.split(':');
    if (property && valueParts.length > 0) {
      styles[camelCase(property.trim())] = valueParts.join(':').trim();
    }
  });

  return styles;
}

function getOrientationClassName(orientation: PieceOrientation): string {
  if (orientation.mirrored && orientation.rotation === 180) {
    return 'piece-transform piece-transform--mirrored-rotated';
  }

  if (orientation.mirrored) {
    return 'piece-transform piece-transform--mirrored';
  }

  if (orientation.rotation === 180) {
    return 'piece-transform piece-transform--rotated';
  }

  return 'piece-transform';
}

function getOrientationTransform(orientation: PieceOrientation): string | undefined {
  const transforms: string[] = [];

  if (orientation.rotation === 180) {
    transforms.push('rotate(180deg)');
  }

  if (orientation.mirrored) {
    transforms.push('scaleX(-1)');
  }

  return transforms.length > 0 ? transforms.join(' ') : undefined;
}

function normalizeTextValue(value: string): string {
  return value.replace(/\\n/g, '\n');
}

function renderSvgTextLines(container: HTMLElement) {
  container.querySelectorAll<SVGTextElement>('text').forEach((textElement) => {
    const value = textElement.textContent ?? '';
    const lines = value.split(/\r?\n/);

    if (lines.length === 1) {
      return;
    }

    const x = textElement.getAttribute('x');
    const lineOffset = (lines.length - 1) * -0.6;
    const originalTransform =
      textElement.dataset.multilineOriginalTransform ?? textElement.getAttribute('transform') ?? '';
    const originalCenterY = Number(textElement.dataset.multilineCenterY);

    // Capture the visual center from the authored one-line label. Its `y`
    // coordinate is not always the geometric center because SVG font metrics
    // differ by browser and font.
    if (!Number.isFinite(originalCenterY)) {
      textElement.dataset.multilineCenterY = String(
        textElement.getBBox().y + textElement.getBBox().height / 2,
      );
    }
    textElement.dataset.multilineOriginalTransform = originalTransform;

    if (originalTransform) {
      textElement.setAttribute('transform', originalTransform);
    } else {
      textElement.removeAttribute('transform');
    }

    textElement.replaceChildren(
      ...lines.map((line, index) => {
        const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');

        if (x !== null) {
          tspan.setAttribute('x', x);
        }

        tspan.setAttribute('dy', index === 0 ? `${lineOffset}em` : '1.2em');
        tspan.textContent = line;
        return tspan;
      }),
    );

    const targetCenterY = Number(textElement.dataset.multilineCenterY);
    const multilineCenterY = textElement.getBBox().y + textElement.getBBox().height / 2;
    const offsetY = targetCenterY - multilineCenterY;

    if (offsetY !== 0) {
      textElement.setAttribute('transform', `${originalTransform} translate(0 ${offsetY})`.trim());
    }
  });
}

export default function TileSvg({
  tileKey,
  tile,
  stateGroups,
  selections,
  textValues,
  orientation = { rotation: 0, mirrored: false },
  className,
  style,
}: TileSvgProps) {
  const tileContentRef = useRef<HTMLSpanElement>(null);
  const resolvedStyles = resolveComponentStyles(tile, selections, stateGroups);
  const texts = tile.texts ?? {};
  const customStyleVars: Record<string, string> = {};
  let rawCssStyles: CSSProperties = {};
  const stateClasses: string[] = [];

  Object.entries(resolvedStyles).forEach(([styleKey, value]) => {
    if (styleKey.startsWith('--')) {
      customStyleVars[styleKey] = value;
      return;
    }

    if (styleKey === 'css') {
      rawCssStyles = parseCssString(value);
      return;
    }

    if (styleKey === 'tailwind') {
      stateClasses.push(
        ...value
          .split(/\s+/)
          .filter(Boolean)
          .map((cls) => (cls.startsWith('!') ? cls : `!${cls}`))
      );
      return;
    }

    if (styleKey === 'class') {
      stateClasses.push(...value.split(/\s+/).filter(Boolean));
    }
  });

  Object.entries(texts).forEach(([textKey, config]) => {
    customStyleVars[textKey === 'text' ? '--color-text' : `--color-${textKey}`] = config.fill;
    customStyleVars[textKey === 'text' ? '--size-text' : `--size-${textKey}`] = config.size;
  });

  const TileComponent = tile.component;

  useLayoutEffect(() => {
    if (tileContentRef.current) {
      renderSvgTextLines(tileContentRef.current);
    }
  });

  return (
    <span ref={tileContentRef} className="contents">
      <TileComponent
        className={[
          getOrientationClassName(orientation),
          className,
          ...stateClasses,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          ...customStyleVars,
          ...rawCssStyles,
          ...style,
          transform: getOrientationTransform(orientation),
          transformOrigin: 'center',
        }}
        {...Object.keys(texts).reduce((acc, textKey) => {
          acc[textKey] = normalizeTextValue(textValues?.[textKey] ?? texts[textKey].text);
          return acc;
        }, {} as Record<string, string>)}
        data-tile-key={tileKey}
      />
    </span>
  );
}
