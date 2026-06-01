import * as PIXI from 'pixi.js';
import { useGameStore } from '../store/useGameStore';
import { soundManager } from '../utils/SoundManager';
import type { Direction } from '../types/game';

export const GAME_SHAPES: Record<string, number[][]> = {
  Dot: [[1]],
  Domino: [[1, 1]],
  Tri: [[1, 1, 1]],
  Hook: [
    [1, 0],
    [1, 1],
  ],
  Square: [
    [1, 1],
    [1, 1],
  ],
  Bar: [[1, 1, 1, 1]],
  Tee: [
    [1, 1, 1],
    [0, 1, 0],
  ],
  Zee: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  Ell: [
    [1, 0],
    [1, 0],
    [1, 1],
  ],
  Fork: [
    [1, 1],
    [1, 0],
    [1, 1],
  ],
  LongJay: [
    [0, 1],
    [0, 1],
    [1, 1],
  ],
};

export const GAME_SHAPE_NAMES = Object.keys(GAME_SHAPES);

const PIXEL_COLORS = [
  { css: '#38f7ff', pixi: 0x38f7ff },
  { css: '#ff4fd8', pixi: 0xff4fd8 },
  { css: '#44ff75', pixi: 0x44ff75 },
  { css: '#ffd447', pixi: 0xffd447 },
  { css: '#ff6b35', pixi: 0xff6b35 },
  { css: '#8f7cff', pixi: 0x8f7cff },
];

interface BlockData {
  id: string;
  direction: Direction;
  stepTimer: number;
  stepInterval: number;
  entrySlowTicks: number;
  graphics: PIXI.Container;
  ghost: PIXI.Container;
  pixiColor: number;
  shape: number[][];
  gridX: number;
  gridY: number;
}

interface FxItem {
  node: PIXI.Container;
  life: number;
  duration: number;
  update: (progress: number) => void;
}

const shapeSize = (shape: number[][]) => ({
  width: Math.max(...shape.map((row) => row.length)),
  height: shape.length,
});

const rotateShape = (shape: number[][]) => shape[0].map((_, i) => shape.map((row) => row[i] || 0).reverse());

const weightedShapeNames = (level: number, gridSize: number, usedRatio: number) => {
  const maxShapeIndex = Math.min(GAME_SHAPE_NAMES.length - 1, 3 + Math.floor(level / 2));
  const unlocked = GAME_SHAPE_NAMES.filter((_, index) => index <= maxShapeIndex);
  const smallWeight = level <= 4 ? 7 : level <= 10 ? 4 : 2;
  const mediumWeight = level <= 4 ? 3 : level <= 10 ? 4 : 5;
  const largeWeight = gridSize >= 10 ? 5 : 2;
  const lateLevelSmallBoost = level >= 15 ? 6 : level >= 11 ? 3 : 0;
  const deckSmallBoost = usedRatio >= 0.75 ? 18 : usedRatio >= 0.5 ? 10 : usedRatio >= 0.35 ? 4 : 0;
  const weights: Record<string, number> = {
    Dot: smallWeight + 3 + lateLevelSmallBoost + deckSmallBoost,
    Domino: smallWeight + 5 + lateLevelSmallBoost + deckSmallBoost,
    Tri: Math.max(2, smallWeight),
    Hook: mediumWeight,
    Square: mediumWeight,
    Bar: largeWeight,
    Tee: largeWeight,
    Zee: largeWeight,
    Ell: largeWeight,
    Fork: largeWeight,
    LongJay: largeWeight,
  };

  return unlocked.flatMap((name) => Array.from({ length: weights[name] || 1 }, () => name));
};

const createPieceId = () => {
  if (globalThis.crypto && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `piece-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export class GameEngine {
  private app: PIXI.Application;
  private gridGraphics = new PIXI.Graphics();
  private settledContainer = new PIXI.Container();
  private ghostContainer = new PIXI.Container();
  private blocksContainer = new PIXI.Container();
  private fxContainer = new PIXI.Container();
  private cellSize = 32;
  private activeBlock: BlockData | null = null;
  private fxItems: FxItem[] = [];
  private spawnTimer = 0;
  private isReady = false;
  private isDestroyed = false;
  private readonly queueSize = 5;

  constructor(canvas: HTMLCanvasElement) {
    this.app = new PIXI.Application();
    void this.init(canvas);
    window.addEventListener('resize', this.onResize);
    this.refillQueue();
  }

  private async init(canvas: HTMLCanvasElement) {
    try {
      await this.app.init({
        canvas,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0x090616,
        antialias: false,
        roundPixels: true,
      });
      this.app.stage.addChild(
        this.gridGraphics,
        this.settledContainer,
        this.ghostContainer,
        this.blocksContainer,
        this.fxContainer,
      );
      this.isReady = true;
      this.drawGrid();
      this.redrawSettledBlocks();
      this.app.ticker.add(this.update);
    } catch (error) {
      console.error(error);
    }
  }

  private getGridBaseCoords() {
    const { gridWidth, gridHeight } = useGameStore.getState();
    const isMobile = window.innerWidth < 760;
    const hudReserve = isMobile ? 330 : 120;
    const availableHeight = Math.max(220, window.innerHeight - hudReserve);
    const maxBoardWidth = Math.min(window.innerWidth * (isMobile ? 0.94 : 0.74), 620);
    const maxBoardHeight = availableHeight * (isMobile ? 0.98 : 0.82);
    this.cellSize = Math.max(
      isMobile ? 14 : 20,
      Math.floor(Math.min(maxBoardWidth / gridWidth, maxBoardHeight / gridHeight)),
    );
    const totalWidth = gridWidth * this.cellSize;
    const totalHeight = gridHeight * this.cellSize;
    const boardTop = isMobile ? 172 : Math.floor((this.app.screen.height - totalHeight) / 2);
    return {
      startX: Math.floor((this.app.screen.width - totalWidth) / 2),
      startY: isMobile ? Math.max(160, Math.min(boardTop, this.app.screen.height - totalHeight - 158)) : boardTop,
      totalWidth,
      totalHeight,
    };
  }

  private drawGrid() {
    if (!this.isReady || this.isDestroyed) return;
    this.gridGraphics.clear();
    const { startX, startY } = this.getGridBaseCoords();
    const { gridWidth, gridHeight } = useGameStore.getState();

    this.gridGraphics
      .roundRect(startX - 10, startY - 10, gridWidth * this.cellSize + 20, gridHeight * this.cellSize + 20, 8)
      .fill({ color: 0x100f24, alpha: 0.86 })
      .stroke({ color: 0x38f7ff, width: 2, alpha: 0.45 });

    for (let y = 0; y < gridHeight; y += 1) {
      for (let x = 0; x < gridWidth; x += 1) {
        this.gridGraphics
          .rect(startX + x * this.cellSize, startY + y * this.cellSize, this.cellSize - 1, this.cellSize - 1)
          .fill({ color: (x + y) % 2 === 0 ? 0x171532 : 0x12102a, alpha: 0.88 })
          .stroke({ color: 0xffffff, width: 1, alpha: 0.055 });
      }
    }
  }

  private refillQueue() {
    const currentQueue = [...useGameStore.getState().nextPieces];
    const state = useGameStore.getState();
    const level = state.level;
    const gridSize = state.gridWidth;
    const usedRatio = state.blocksSpawned / Math.max(1, state.currentLevel.blockLimit);
    const shapeNames = weightedShapeNames(level, gridSize, usedRatio);
    const availableToQueue = Math.max(
      0,
      useGameStore.getState().currentLevel.blockLimit - useGameStore.getState().blocksSpawned - currentQueue.length,
    );
    const targetQueueSize = Math.min(this.queueSize, currentQueue.length + availableToQueue);

    while (currentQueue.length < targetQueueSize) {
      const name = shapeNames[Math.floor(Math.random() * shapeNames.length)];
      const color = PIXEL_COLORS[Math.floor(Math.random() * PIXEL_COLORS.length)];
      currentQueue.push({
        id: createPieceId(),
        name,
        shape: GAME_SHAPES[name].map((row) => [...row]),
        color: color.css,
        pixiColor: color.pixi,
      });
    }
    useGameStore.getState().setNextPieces(currentQueue);
  }

  public replaceUpcomingShapes(names: string[]) {
    const queue = useGameStore.getState().nextPieces;
    if (names.length === 0 || names.length !== queue.length) return false;
    const nextPieces = names.map((name, index) => {
      const shape = GAME_SHAPES[name];
      if (!shape) return null;
      const existing = queue[index];
      const fallbackColor = PIXEL_COLORS[index % PIXEL_COLORS.length];
      return {
        id: createPieceId(),
        name,
        shape: shape.map((row) => [...row]),
        color: existing?.color ?? fallbackColor.css,
        pixiColor: existing?.pixiColor ?? fallbackColor.pixi,
      };
    });
    if (nextPieces.some((piece) => !piece)) return false;
    useGameStore.getState().setNextPieces(nextPieces.filter((piece): piece is NonNullable<typeof piece> => Boolean(piece)));
    return true;
  }

  private pickDirection(): Direction {
    const level = useGameStore.getState().currentLevel;
    if (level.id <= 4) return 'DOWN';
    const earlyBias = level.directions.flatMap((direction) => (direction === 'DOWN' ? [direction, direction, direction] : [direction]));
    return earlyBias[Math.floor(Math.random() * earlyBias.length)];
  }

  private spawnBlock() {
    if (!this.isReady || this.activeBlock || this.isGameStopped()) return;
    const nextPiece = useGameStore.getState().popNextPiece();
    if (!nextPiece) {
      this.refillQueue();
      if (useGameStore.getState().nextPieces.length === 0) useGameStore.getState().gameOver();
      return;
    }
    useGameStore.getState().registerBlockSpawned();

    const { gridWidth, gridHeight } = useGameStore.getState();
    const direction = this.pickDirection();
    const { width, height } = shapeSize(nextPiece.shape);
    let gridX = 0;
    let gridY = 0;

    if (direction === 'DOWN') {
      gridX = Math.floor(Math.random() * Math.max(1, gridWidth - width + 1));
      gridY = -height;
    } else if (direction === 'UP') {
      gridX = Math.floor(Math.random() * Math.max(1, gridWidth - width + 1));
      gridY = gridHeight;
    } else if (direction === 'RIGHT') {
      gridX = -width;
      gridY = Math.floor(Math.random() * Math.max(1, gridHeight - height + 1));
    } else {
      gridX = gridWidth;
      gridY = Math.floor(Math.random() * Math.max(1, gridHeight - height + 1));
    }

    const graphics = new PIXI.Container();
    const ghost = new PIXI.Container();
    this.drawShape(graphics, nextPiece.shape, nextPiece.pixiColor, 0.82);
    this.drawShape(ghost, nextPiece.shape, 0xffffff, 0.18);
    this.blocksContainer.addChild(graphics);
    this.ghostContainer.addChild(ghost);

    this.activeBlock = {
      id: nextPiece.id,
      direction,
      stepTimer: 0,
      stepInterval: useGameStore.getState().currentLevel.speed,
      entrySlowTicks: direction === 'DOWN' ? 2 : 1,
      graphics,
      ghost,
      pixiColor: nextPiece.pixiColor,
      shape: nextPiece.shape,
      gridX,
      gridY,
    };

    this.renderActiveBlock();
    this.refillQueue();
  }

  private finishIfDeckIsEmpty() {
    const state = useGameStore.getState();
    if (
      !this.activeBlock &&
      state.status === 'PLAYING' &&
      state.remainingBlocks <= 0 &&
      state.nextPieces.length === 0
    ) {
      state.gameOver();
    }
  }

  private drawShape(container: PIXI.Container, shape: number[][], color: number, alpha: number) {
    container.removeChildren();
    shape.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        if (!cell) return;
        const block = new PIXI.Graphics();
        const inset = Math.max(2, Math.floor(this.cellSize * 0.07));
        block
          .roundRect(
            columnIndex * this.cellSize + inset,
            rowIndex * this.cellSize + inset,
            this.cellSize - inset * 2,
            this.cellSize - inset * 2,
            4,
          )
          .fill({ color, alpha })
          .stroke({ color: 0xffffff, width: 1, alpha: alpha > 0.5 ? 0.52 : 0.18 });
        container.addChild(block);
      });
    });
  }

  private drawActiveShape(block: BlockData) {
    block.graphics.removeChildren();
    const filled = useGameStore.getState().cells;
    block.shape.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        if (!cell) return;
        const targetX = block.gridX + columnIndex;
        const targetY = block.gridY + rowIndex;
        const overlapsSettled = filled.has(`${targetX},${targetY}`);
        const inset = Math.max(2, Math.floor(this.cellSize * 0.07));
        const tile = new PIXI.Graphics();
        tile
          .roundRect(
            columnIndex * this.cellSize + inset,
            rowIndex * this.cellSize + inset,
            this.cellSize - inset * 2,
            this.cellSize - inset * 2,
            4,
          )
          .fill({ color: overlapsSettled ? 0xff4f6d : block.pixiColor, alpha: overlapsSettled ? 0.62 : 0.82 })
          .stroke({ color: overlapsSettled ? 0xffffff : 0xffffff, width: overlapsSettled ? 3 : 2, alpha: overlapsSettled ? 0.92 : 0.72 });

        if (overlapsSettled) {
          const pad = Math.max(5, this.cellSize * 0.18);
          tile
            .moveTo(columnIndex * this.cellSize + pad, rowIndex * this.cellSize + pad)
            .lineTo((columnIndex + 1) * this.cellSize - pad, (rowIndex + 1) * this.cellSize - pad)
            .moveTo((columnIndex + 1) * this.cellSize - pad, rowIndex * this.cellSize + pad)
            .lineTo(columnIndex * this.cellSize + pad, (rowIndex + 1) * this.cellSize - pad)
            .stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
        }

        block.graphics.addChild(tile);
      });
    });
  }

  private addFx(node: PIXI.Container, duration: number, update: (progress: number) => void) {
    this.fxContainer.addChild(node);
    this.fxItems.push({ node, life: 0, duration, update });
    update(0);
  }

  private updateFx(delta: number) {
    for (let i = this.fxItems.length - 1; i >= 0; i -= 1) {
      const item = this.fxItems[i];
      item.life += delta;
      const progress = Math.min(1, item.life / item.duration);
      item.update(progress);
      if (progress >= 1) {
        this.fxContainer.removeChild(item.node);
        item.node.destroy({ children: true });
        this.fxItems.splice(i, 1);
      }
    }
  }

  private cellCenter(cell: { x: number; y: number }) {
    const { startX, startY } = this.getGridBaseCoords();
    return {
      x: startX + cell.x * this.cellSize + this.cellSize / 2,
      y: startY + cell.y * this.cellSize + this.cellSize / 2,
    };
  }

  private playPlacementFx(cells: { x: number; y: number }[], color: number) {
    cells.forEach((cell, index) => {
      const center = this.cellCenter(cell);
      const ring = new PIXI.Graphics();
      ring.x = center.x;
      ring.y = center.y;
      this.addFx(ring, 22 + index * 1.5, (progress) => {
        const radius = this.cellSize * (0.22 + progress * 0.58);
        ring.clear();
        ring.circle(0, 0, radius).stroke({ color, width: 3, alpha: 0.75 * (1 - progress) });
        ring.alpha = 1 - progress * 0.4;
      });
    });

    this.playFloatingText('+', cells[Math.floor(cells.length / 2)], 0x44ff75, 28);
  }

  private playWhiteFx(keys: string[]) {
    if (keys.length === 0) return;
    const sparkle = new PIXI.Container();
    const { startX, startY } = this.getGridBaseCoords();
    keys.forEach((key) => {
      const [gridX, gridY] = key.split(',').map(Number);
      const flash = new PIXI.Graphics();
      flash.x = startX + gridX * this.cellSize;
      flash.y = startY + gridY * this.cellSize;
      sparkle.addChild(flash);
    });

    this.addFx(sparkle, 34, (progress) => {
      sparkle.children.forEach((child, index) => {
        const flash = child as PIXI.Graphics;
        const delay = (index % 7) * 0.035;
        const local = Math.max(0, Math.min(1, (progress - delay) / 0.72));
        flash.clear();
        flash
          .roundRect(2, 2, this.cellSize - 4, this.cellSize - 4, 5)
          .fill({ color: 0xffffff, alpha: (1 - local) * 0.92 })
          .stroke({ color: 0x38f7ff, width: 2, alpha: (1 - local) * 0.65 });
        flash.scale.set(1 + local * 0.22);
        flash.alpha = local <= 0 ? 0 : 1;
      });
    });

    const [firstKey] = keys;
    const [x, y] = firstKey.split(',').map(Number);
    this.playFloatingText('LINE!', { x, y }, 0xffffff, 42);
  }

  private playBombFx(cell: { x: number; y: number }, erased: number) {
    const center = this.cellCenter(cell);
    const burst = new PIXI.Graphics();
    burst.x = center.x;
    burst.y = center.y;
    this.addFx(burst, 34, (progress) => {
      const radius = this.cellSize * (0.28 + progress * 1.85);
      burst.clear();
      burst
        .circle(0, 0, radius)
        .fill({ color: 0xff9f1c, alpha: 0.24 * (1 - progress) })
        .stroke({ color: 0xffd447, width: 4, alpha: 0.92 * (1 - progress) })
        .circle(0, 0, radius * 0.58)
        .stroke({ color: 0xff4f6d, width: 3, alpha: 0.8 * (1 - progress) });
    });
    this.playFloatingText(`+${erased * 25}`, cell, 0xffd447, 34);
  }

  private playAutoClearFx(cell: { x: number; y: number }, erased: number) {
    this.playBombFx(cell, erased);
    const center = this.cellCenter(cell);
    const wave = new PIXI.Graphics();
    wave.x = center.x + this.cellSize * 0.5;
    wave.y = center.y + this.cellSize * 0.5;
    this.addFx(wave, 38, (progress) => {
      const size = this.cellSize * (1.8 + progress * 3.2);
      wave.clear();
      wave
        .roundRect(-size / 2, -size / 2, size, size, 8)
        .stroke({ color: 0xffffff, width: 4, alpha: 0.88 * (1 - progress) });
    });
    this.playFloatingText('5X 4x4 TEMIZLIK!', cell, 0xffffff, 26);
  }

  private playLineClearPowerFx(axis: 'ROW' | 'COLUMN', index: number, erased: number) {
    const { startX, startY, totalWidth, totalHeight } = this.getGridBaseCoords();
    const beam = new PIXI.Graphics();
    this.addFx(beam, 34, (progress) => {
      const alpha = 0.92 * (1 - progress);
      const expansion = this.cellSize * progress * 0.9;
      beam.clear();
      if (axis === 'ROW') {
        beam
          .roundRect(startX - expansion, startY + index * this.cellSize + 3 - expansion / 2, totalWidth + expansion * 2, this.cellSize - 6 + expansion, 6)
          .fill({ color: 0xffd447, alpha: 0.28 * (1 - progress) })
          .stroke({ color: 0xffffff, width: 3, alpha });
      } else {
        beam
          .roundRect(startX + index * this.cellSize + 3 - expansion / 2, startY - expansion, this.cellSize - 6 + expansion, totalHeight + expansion * 2, 6)
          .fill({ color: 0x38f7ff, alpha: 0.28 * (1 - progress) })
          .stroke({ color: 0xffffff, width: 3, alpha });
      }
    });
    const { gridWidth, gridHeight } = useGameStore.getState();
    this.playFloatingText(
      `+${erased * 25}`,
      axis === 'ROW' ? { x: Math.floor(gridWidth / 2), y: index } : { x: index, y: Math.floor(gridHeight / 2) },
      0xffffff,
      34,
    );
  }

  private playVictoryFx() {
    const { gridWidth, gridHeight } = useGameStore.getState();
    const { startX, startY, totalWidth, totalHeight } = this.getGridBaseCoords();
    const celebration = new PIXI.Container();
    const boardPulse = new PIXI.Graphics();
    celebration.addChild(boardPulse);

    const particles = Array.from({ length: 32 }, (_, index) => {
      const particle = new PIXI.Graphics()
        .roundRect(-3, -3, 6, 6, 2)
        .fill({ color: index % 3 === 0 ? 0xffd447 : index % 3 === 1 ? 0x38f7ff : 0x44ff75, alpha: 1 });
      const angle = (Math.PI * 2 * index) / 32 + (index % 4) * 0.08;
      particle.x = startX + totalWidth / 2;
      particle.y = startY + totalHeight / 2;
      celebration.addChild(particle);
      return { particle, angle, distance: Math.max(totalWidth, totalHeight) * (0.38 + (index % 5) * 0.08) };
    });

    this.addFx(celebration, 118, (progress) => {
      const pulse = Math.sin(progress * Math.PI);
      boardPulse.clear();
      boardPulse
        .roundRect(startX - 10, startY - 10, totalWidth + 20, totalHeight + 20, 8)
        .stroke({ color: 0xffffff, width: 4 + pulse * 5, alpha: 0.92 * (1 - progress) })
        .roundRect(startX - 18 - progress * 16, startY - 18 - progress * 16, totalWidth + 36 + progress * 32, totalHeight + 36 + progress * 32, 12)
        .stroke({ color: 0x38f7ff, width: 3, alpha: 0.72 * (1 - progress) });

      particles.forEach(({ particle, angle, distance }, index) => {
        const travel = Math.sin(progress * Math.PI * 0.62) * distance;
        particle.x = startX + totalWidth / 2 + Math.cos(angle) * travel;
        particle.y = startY + totalHeight / 2 + Math.sin(angle) * travel + progress * progress * this.cellSize * 2;
        particle.rotation = progress * (index % 2 === 0 ? 5 : -5);
        particle.alpha = Math.max(0, 1 - progress * 1.12);
        particle.scale.set(1 + pulse * 0.85);
      });
    });

    this.playFloatingText('TAMAMLANDI!', { x: Math.floor(gridWidth / 2), y: Math.floor(gridHeight / 2) }, 0xffffff, 42);
  }

  private playMissFx(block: BlockData) {
    const flash = new PIXI.Graphics();
    this.addFx(flash, 28, (progress) => {
      flash.clear();
      flash.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({
        color: 0xff2f55,
        alpha: 0.22 * (1 - progress),
      });
    });

    const anchor = {
      x: Math.max(0, Math.min(useGameStore.getState().gridWidth - 1, block.gridX)),
      y: Math.max(0, Math.min(useGameStore.getState().gridHeight - 1, block.gridY)),
    };
    this.playFloatingText('-30', anchor, 0xff4f6d, 48);
  }

  private playFloatingText(text: string, cell: { x: number; y: number }, color: number, size: number) {
    const center = this.cellCenter(cell);
    const label = new PIXI.Text({
      text,
      style: {
        fill: color,
        fontFamily: 'Orbitron, Arial, sans-serif',
        fontSize: size,
        fontWeight: '900',
        stroke: { color: 0x090616, width: 4 },
      },
    });
    label.anchor.set(0.5);
    label.x = center.x;
    label.y = center.y;
    this.addFx(label, 42, (progress) => {
      label.y = center.y - progress * this.cellSize * 1.35;
      label.alpha = 1 - progress;
      label.scale.set(0.8 + Math.sin(progress * Math.PI) * 0.22);
    });
  }

  private renderActiveBlock() {
    if (!this.activeBlock) return;
    const { startX, startY } = this.getGridBaseCoords();
    const block = this.activeBlock;
    this.drawActiveShape(block);
    block.graphics.x = startX + block.gridX * this.cellSize;
    block.graphics.y = startY + block.gridY * this.cellSize;

    block.ghost.x = block.graphics.x;
    block.ghost.y = block.graphics.y;
    block.ghost.visible = this.canPlace(block.shape, block.gridX, block.gridY);
  }

  private getStep(direction: Direction) {
    if (direction === 'DOWN') return { x: 0, y: 1 };
    if (direction === 'UP') return { x: 0, y: -1 };
    if (direction === 'RIGHT') return { x: 1, y: 0 };
    return { x: -1, y: 0 };
  }

  private canPlace(shape: number[][], gridX: number, gridY: number): boolean {
    const cells = useGameStore.getState().cells;
    return shape.every((row, y) =>
      row.every((cell, x) => {
        if (!cell) return true;
        const targetX = gridX + x;
        const targetY = gridY + y;
        return this.isInsideCell(targetX, targetY) && !cells.has(`${targetX},${targetY}`);
      }),
    );
  }

  private canOccupy(shape: number[][], gridX: number, gridY: number, direction: Direction): boolean {
    const { gridWidth, gridHeight } = useGameStore.getState();
    return shape.every((row, y) =>
      row.every((cell, x) => {
        if (!cell) return true;
        const targetX = gridX + x;
        const targetY = gridY + y;
        if (direction === 'DOWN' || direction === 'UP') return targetX >= 0 && targetX < gridWidth;
        return targetY >= 0 && targetY < gridHeight;
      }),
    );
  }

  private isInsideCell(x: number, y: number) {
    const { gridWidth, gridHeight } = useGameStore.getState();
    return x >= 0 && x < gridWidth && y >= 0 && y < gridHeight;
  }

  private isPastBoard(block: BlockData) {
    const { gridWidth, gridHeight } = useGameStore.getState();
    const { width, height } = shapeSize(block.shape);
    if (block.direction === 'DOWN') return block.gridY > gridHeight;
    if (block.direction === 'UP') return block.gridY + height < 0;
    if (block.direction === 'RIGHT') return block.gridX > gridWidth;
    return block.gridX + width < 0;
  }

  public rotateActiveBlocks() {
    if (!this.activeBlock || this.isGameStopped()) return;
    const rotated = rotateShape(this.activeBlock.shape);
    if (
      !this.canOccupy(rotated, this.activeBlock.gridX, this.activeBlock.gridY, this.activeBlock.direction) ||
      !this.sideAxisInBounds(rotated, this.activeBlock.gridX, this.activeBlock.gridY, this.activeBlock.direction)
    ) {
      return;
    }
    this.activeBlock.shape = rotated;
    this.drawShape(this.activeBlock.ghost, rotated, 0xffffff, 0.18);
    this.renderActiveBlock();
    soundManager.playRotate();
  }

  public moveActiveBlocksSideways(direction: 'LEFT' | 'RIGHT') {
    if (!this.activeBlock || this.isGameStopped()) return;
    const block = this.activeBlock;
    const delta = direction === 'LEFT' ? -1 : 1;
    const nextX = ['DOWN', 'UP'].includes(block.direction) ? block.gridX + delta : block.gridX;
    const nextY = ['LEFT', 'RIGHT'].includes(block.direction) ? block.gridY + delta : block.gridY;
    if (
      !this.canOccupy(block.shape, nextX, nextY, block.direction) ||
      !this.sideAxisInBounds(block.shape, nextX, nextY, block.direction)
    ) {
      return;
    }
    block.gridX = nextX;
    block.gridY = nextY;
    this.renderActiveBlock();
    soundManager.playMove();
  }

  private sideAxisInBounds(shape: number[][], gridX: number, gridY: number, direction: Direction) {
    const { gridWidth, gridHeight } = useGameStore.getState();
    const { width, height } = shapeSize(shape);
    if (direction === 'DOWN' || direction === 'UP') return gridX >= 0 && gridX + width <= gridWidth;
    return gridY >= 0 && gridY + height <= gridHeight;
  }

  public accelerateActiveBlocks() {
    if (!this.activeBlock || this.isGameStopped()) return;
    this.stepActiveBlock(true);
    if (this.activeBlock) this.activeBlock.stepTimer = 0;
  }

  public activateSoftDrop() {
    if (!this.activeBlock || this.isGameStopped()) return;
    this.activeBlock.stepInterval = Math.min(this.activeBlock.stepInterval, 7);
    this.accelerateActiveBlocks();
  }

  public hardDropActiveBlock() {
    if (!this.activeBlock || this.isGameStopped()) return;
    const block = this.activeBlock;
    const step = this.getStep(block.direction);
    let moved = false;
    while (this.canOccupy(block.shape, block.gridX + step.x, block.gridY + step.y, block.direction)) {
      block.gridX += step.x;
      block.gridY += step.y;
      moved = true;
      if (this.isPastBoard(block)) {
        this.missActiveBlock();
        return;
      }
    }
    if (moved) this.renderActiveBlock();
    this.attemptPlace();
  }

  public attemptPlace() {
    if (!this.activeBlock || this.isGameStopped()) return false;
    if (!this.canPlace(this.activeBlock.shape, this.activeBlock.gridX, this.activeBlock.gridY)) {
      soundManager.playError();
      return false;
    }
    this.settleActiveBlock();
    return true;
  }

  public detonateBombAtScreenPoint(screenX: number, screenY: number) {
    const status = useGameStore.getState().status;
    if (!this.isReady || this.isDestroyed || !['PLAYING', 'PAUSED'].includes(status)) return false;
    const { startX, startY } = this.getGridBaseCoords();
    const x = Math.floor((screenX - startX) / this.cellSize);
    const y = Math.floor((screenY - startY) / this.cellSize);
    if (!this.isInsideCell(x, y)) {
      soundManager.playError();
      return false;
    }
    const erased = useGameStore.getState().detonateBomb(x, y);
    if (erased === 0) {
      soundManager.playError();
      return false;
    }
    this.redrawSettledBlocks();
    this.playBombFx({ x, y }, erased);
    soundManager.playBomb();
    return true;
  }

  public clearLineAtScreenPoint(axis: 'ROW' | 'COLUMN', screenX: number, screenY: number) {
    const status = useGameStore.getState().status;
    if (!this.isReady || this.isDestroyed || !['PLAYING', 'PAUSED'].includes(status)) return false;
    const { startX, startY } = this.getGridBaseCoords();
    const x = Math.floor((screenX - startX) / this.cellSize);
    const y = Math.floor((screenY - startY) / this.cellSize);
    if (!this.isInsideCell(x, y)) {
      soundManager.playError();
      return false;
    }
    const index = axis === 'ROW' ? y : x;
    const erased = useGameStore.getState().clearLine(axis, index);
    if (erased === 0) {
      soundManager.playError();
      return false;
    }
    this.redrawSettledBlocks();
    this.playLineClearPowerFx(axis, index, erased);
    soundManager.playLineClearPower();
    return true;
  }

  private isInEntryZone(block: BlockData) {
    const { gridWidth, gridHeight } = useGameStore.getState();
    const { width, height } = shapeSize(block.shape);
    if (block.direction === 'DOWN') return block.gridY + height <= 1;
    if (block.direction === 'UP') return block.gridY >= gridHeight - 1;
    if (block.direction === 'RIGHT') return block.gridX + width <= 1;
    return block.gridX >= gridWidth - 1;
  }

  private getCurrentStepInterval(block: BlockData) {
    return block.stepInterval;
  }

  private stepActiveBlock(force = false) {
    if (!this.activeBlock) return;
    const block = this.activeBlock;
    if (!force && block.entrySlowTicks > 0 && this.isInEntryZone(block)) {
      block.entrySlowTicks -= 1;
      this.renderActiveBlock();
      return;
    }
    const step = this.getStep(block.direction);
    const nextX = block.gridX + step.x;
    const nextY = block.gridY + step.y;

    if (this.canOccupy(block.shape, nextX, nextY, block.direction)) {
      block.gridX = nextX;
      block.gridY = nextY;
      this.renderActiveBlock();
      if (this.isPastBoard(block)) this.missActiveBlock();
      return;
    }

    this.missActiveBlock();
  }

  private settleActiveBlock() {
    if (!this.activeBlock) return;
    const block = this.activeBlock;
    const cells = block.shape
      .flatMap((row, y) => row.map((cell, x) => (cell ? { x: block.gridX + x, y: block.gridY + y } : null)))
      .filter((cell): cell is { x: number; y: number } => Boolean(cell));

    useGameStore.getState().fillCells(cells, block.pixiColor);
    useGameStore.getState().addPlacementScore(cells.length);
    const whiteBefore = this.getWhiteKeys();
    const completed = useGameStore.getState().whitenCompletedLines();
    const newWhiteKeys = Array.from(this.getWhiteKeys()).filter((key) => !whiteBefore.has(key));
    useGameStore.getState().addCompletedLines(completed);
    this.blocksContainer.removeChild(block.graphics);
    this.ghostContainer.removeChild(block.ghost);
    this.activeBlock = null;
    useGameStore.getState().registerBlockConsumed();
    this.redrawSettledBlocks();
    this.playPlacementFx(cells, block.pixiColor);
    this.playWhiteFx(newWhiteKeys);
    soundManager.playSettle();
    if (completed > 0) soundManager.playLineComplete(completed);
    if (useGameStore.getState().status === 'LEVEL_COMPLETE') {
      this.playVictoryFx();
      soundManager.playLevelUp();
    }
    this.finishIfDeckIsEmpty();
  }

  private missActiveBlock() {
    if (!this.activeBlock) return;
    this.playMissFx(this.activeBlock);
    this.blocksContainer.removeChild(this.activeBlock.graphics);
    this.ghostContainer.removeChild(this.activeBlock.ghost);
    this.activeBlock = null;
    useGameStore.getState().registerBlockConsumed();
    const autoClear = useGameStore.getState().registerMiss();
    if (autoClear) {
      this.redrawSettledBlocks();
      this.playAutoClearFx(autoClear, autoClear.erased);
      soundManager.playBomb();
    } else {
      soundManager.playError();
    }
    this.finishIfDeckIsEmpty();
  }

  private getWhiteKeys() {
    const whiteKeys = new Set<string>();
    useGameStore.getState().cells.forEach((color, key) => {
      if (color === 0xffffff) whiteKeys.add(key);
    });
    return whiteKeys;
  }

  public redrawSettledBlocks() {
    if (!this.isReady || this.isDestroyed) return;
    this.settledContainer.removeChildren();
    const { startX, startY } = this.getGridBaseCoords();
    const { gridWidth, gridHeight } = useGameStore.getState();
    useGameStore.getState().cells.forEach((color, key) => {
      const [gridX, gridY] = key.split(',').map(Number);
      if (gridX < 0 || gridX >= gridWidth || gridY < 0 || gridY >= gridHeight) return;
      const block = new PIXI.Graphics();
      const inset = Math.max(2, Math.floor(this.cellSize * 0.07));
      block
        .roundRect(
          startX + gridX * this.cellSize + inset,
          startY + gridY * this.cellSize + inset,
          this.cellSize - inset * 2,
          this.cellSize - inset * 2,
          4,
        )
        .fill({ color, alpha: 1 })
        .stroke({ color: 0xffffff, width: 1, alpha: 0.38 });
      this.settledContainer.addChild(block);
    });
  }

  public refreshBoard() {
    this.drawGrid();
    this.redrawSettledBlocks();
    if (this.activeBlock) {
      this.drawShape(this.activeBlock.ghost, this.activeBlock.shape, 0xffffff, 0.18);
      this.renderActiveBlock();
    }
  }

  private isGameStopped() {
    const status = useGameStore.getState().status;
    return this.isDestroyed || status === 'PAUSED' || status === 'LEVEL_COMPLETE' || status === 'GAME_OVER';
  }

  private update = (ticker: PIXI.Ticker) => {
    const delta = ticker.deltaTime;
    if (this.isReady) this.updateFx(delta);
    if (!this.isReady || this.isGameStopped()) return;

    if (!this.activeBlock) {
      this.spawnTimer += delta;
      if (this.spawnTimer > 18) {
        this.spawnBlock();
        this.spawnTimer = 0;
      }
      return;
    }

    this.activeBlock.stepTimer += delta;
    if (this.activeBlock.stepTimer >= this.getCurrentStepInterval(this.activeBlock)) {
      this.activeBlock.stepTimer = 0;
      this.stepActiveBlock();
    }
  };

  private onResize = () => {
    if (!this.app || this.isDestroyed) return;
    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.refreshBoard();
  };

  public destroy() {
    this.isDestroyed = true;
    window.removeEventListener('resize', this.onResize);
    try {
      this.app.destroy(true);
    } catch {
      // Pixi can throw during hot reload teardown after the canvas has already gone away.
    }
  }
}
