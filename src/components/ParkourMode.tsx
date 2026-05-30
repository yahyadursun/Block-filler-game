import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import type { ParkourLevelData } from '../types/game';
import { soundManager } from '../utils/SoundManager';
import '../styles/ParkourMode.css';

type Mode = 'BUILD' | 'SHOOT' | 'WON' | 'LOST';

interface Piece {
  shape: number[][];
  x: number;
  y: number;
  color: string;
  shield: boolean;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alive: boolean;
  color: string;
  hitFlash: number;
  trail: { x: number; y: number }[];
}

interface Brick {
  color: string;
  hp: number;
  shield?: number;
  hitFlash?: number;
  completedWall?: boolean;
}

interface LaunchQueue {
  remaining: number;
  vx: number;
  vy: number;
  timer: number;
}

interface ShieldEffect {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  kind: 'hit' | 'break' | 'brickHit' | 'brickBreak';
  color?: string;
}

interface Layout {
  startX: number;
  startY: number;
  cell: number;
  width: number;
  height: number;
}

const COLS = 16;
const ROWS = 11;
const COLORS = ['#38f7ff', '#ff4fd8', '#44ff75', '#ffd447', '#ff6b35', '#8f7cff'];
const SHIELD_COLOR = '#9de8ff';
const SHAPES = [
  [[1]],
  [[1, 1]],
  [[1, 1, 1]],
  [
    [1, 0],
    [1, 1],
  ],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [1, 1, 1],
    [0, 1, 0],
  ],
];

const keyFor = (x: number, y: number) => `${x},${y}`;
const parseKey = (key: string) => {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
};
const rotateShape = (shape: number[][]) => shape[0].map((_, i) => shape.map((row) => row[i] || 0).reverse());

const shapeSize = (shape: number[][]) => ({
  width: Math.max(...shape.map((row) => row.length)),
  height: shape.length,
});

const pieceCellCount = (piece: Piece) => piece.shape.reduce((total, row) => total + row.filter(Boolean).length, 0);

const pieceSkipPenalty = (piece: Piece) => pieceCellCount(piece) * 12 + (piece.shield ? 85 : 0);

const shieldStrengthForLevel = (levelId: number) => (levelId >= 8 ? 3 : levelId >= 5 ? 2 : 1);

const seededRandom = (seed: number) => {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
};

const makeStarterBricks = (level: ParkourLevelData) => {
  const bricks = new Map<string, Brick>();
  if (level.starterCells <= 0) return bricks;
  const random = seededRandom(level.id * 4111);
  const add = (x: number, y: number) => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS || bricks.size >= level.starterCells) return;
    const hp = 1 + level.hpBonus + Math.floor(y / 3);
    const shield = level.id >= 4 && (x + y + level.id) % Math.max(3, 7 - Math.floor(level.id / 2)) === 0 ? shieldStrengthForLevel(level.id) : 0;
    bricks.set(keyFor(x, y), { color: COLORS[(x + y + level.id) % COLORS.length], hp, shield });
  };

  const lanes = Math.min(4, 1 + Math.floor(level.id / 2));
  for (let i = 0; i < lanes && bricks.size < level.starterCells; i += 1) {
    const y = Math.floor(random() * Math.max(3, ROWS - 2));
    const gap = Math.floor(random() * COLS);
    const start = Math.floor(random() * 4);
    const length = Math.min(COLS - start, 5 + Math.floor(random() * 5));
    for (let x = start; x < start + length; x += 1) {
      if (x === gap) continue;
      add(x, y);
    }
  }

  while (bricks.size < level.starterCells) {
    add(Math.floor(random() * COLS), Math.floor(random() * Math.max(3, ROWS - 1)));
  }
  return bricks;
};

const randomPiece = (shieldChance = 0.18): Piece => {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)].map((row) => [...row]);
  const { width } = shapeSize(shape);
  return {
    shape,
    x: Math.floor(Math.random() * Math.max(1, COLS - width + 1)),
    y: -shape.length,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    shield: Math.random() < shieldChance,
  };
};

const clonePiece = (piece: Piece): Piece => ({
  ...piece,
  shape: piece.shape.map((row) => [...row]),
});

const ParkourMode: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const modeRef = useRef<Mode>('BUILD');
  const blocksRef = useRef(new Map<string, Brick>());
  const activePieceRef = useRef<Piece>(randomPiece());
  const nextPieceRef = useRef<Piece>(randomPiece());
  const ballsRef = useRef<Ball[]>([]);
  const shieldEffectsRef = useRef<ShieldEffect[]>([]);
  const launchQueueRef = useRef<LaunchQueue | null>(null);
  const aimRef = useRef({ x: 0, y: 0 });
  const layoutRef = useRef<Layout>({ startX: 0, startY: 0, cell: 32, width: 0, height: 0 });
  const dropTimerRef = useRef(0);
  const penaltyTimerRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const lastControlAtRef = useRef(0);
  const [mode, setMode] = useState<Mode>('BUILD');
  const [blockCount, setBlockCount] = useState(0);
  const [piecesUsed, setPiecesUsed] = useState(0);
  const [shotsLeft, setShotsLeft] = useState(8);
  const [score, setScore] = useState(0);
  const [nextPiecePreview, setNextPiecePreview] = useState<Piece>(() => clonePiece(nextPieceRef.current));
  const [lastPenalty, setLastPenalty] = useState<number | null>(null);
  const { setView, currentParkourLevel, parkourLevel, parkourLevels, setParkourLevel } = useGameStore();
  const buildBlockLimit = currentParkourLevel.buildBlockLimit;
  const volleySize = currentParkourLevel.volleySize;
  const shotLimit = currentParkourLevel.shotLimit;
  const shieldChance = Math.min(0.58, 0.18 + currentParkourLevel.id * 0.045);
  const resultStars = mode === 'WON' ? Math.min(5, Math.max(3, 3 + (shotsLeft > 0 ? 1 : 0) + (score >= 600 ? 1 : 0))) : 0;

  const makeRandomPiece = () => randomPiece(shieldChance);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const starterBricks = makeStarterBricks(currentParkourLevel);
    blocksRef.current = starterBricks;
    launchQueueRef.current = null;
    ballsRef.current = [];
    shieldEffectsRef.current = [];
    activePieceRef.current = makeRandomPiece();
    nextPieceRef.current = makeRandomPiece();
    setNextPiecePreview(clonePiece(nextPieceRef.current));
    setBlockCount(starterBricks.size);
    setPiecesUsed(0);
    setShotsLeft(currentParkourLevel.shotLimit);
    setScore(0);
    if (penaltyTimerRef.current) window.clearTimeout(penaltyTimerRef.current);
    setLastPenalty(null);
    modeRef.current = 'BUILD';
    setMode('BUILD');
  }, [currentParkourLevel.id, currentParkourLevel.shotLimit]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') setView('MENU');
      if (modeRef.current !== 'BUILD') return;
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') movePiece(-1);
      if (event.code === 'ArrowRight' || event.code === 'KeyD') movePiece(1);
      if (event.code === 'ArrowUp' || event.code === 'KeyW') rotatePiece();
      if (event.code === 'ArrowDown' || event.code === 'KeyS') stepPiece();
      if (event.code === 'Space') {
        event.preventDefault();
        placePiece();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(window.innerWidth * scale);
      canvas.height = Math.floor(window.innerHeight * scale);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      layoutRef.current = makeLayout(window.innerWidth, window.innerHeight);
      aimRef.current = { x: window.innerWidth / 2, y: layoutRef.current.startY + layoutRef.current.height / 2 };
    };

    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      if (modeRef.current === 'BUILD') updateBuild();
      if (modeRef.current === 'SHOOT') updateShots();
      draw(ctx, window.innerWidth, window.innerHeight);
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (penaltyTimerRef.current) window.clearTimeout(penaltyTimerRef.current);
      if (holdTimerRef.current) window.clearInterval(holdTimerRef.current);
    };
  }, []);

  const makeLayout = (width: number, height: number): Layout => {
    const nextPanelReserve = width >= 980 ? 188 : 24;
    const hudReserve = width < 760 ? 300 : 184;
    const usableWidth = Math.min(width - nextPanelReserve - 36, 1080);
    const usableHeight = Math.min(Math.max(280, height - hudReserve), 610);
    const cell = Math.max(20, Math.floor(Math.min(usableWidth / COLS, usableHeight / ROWS)));
    const boardWidth = cell * COLS;
    const boardHeight = cell * ROWS;
    return {
      startX: Math.floor((width - boardWidth) / 2),
      startY: width < 760 ? 166 : 104,
      cell,
      width: boardWidth,
      height: boardHeight,
    };
  };

  const canOccupy = (piece: Piece, x = piece.x, y = piece.y, shape = piece.shape) =>
    shape.every((row, rowY) =>
      row.every((cell, colX) => {
        if (!cell) return true;
        const gx = x + colX;
        const gy = y + rowY;
        return gx >= 0 && gx < COLS && gy < ROWS + shape.length;
      }),
    );

  const isPiecePastBoard = (piece: Piece) =>
    piece.shape.every((row, rowY) =>
      row.every((cell) => !cell || piece.y + rowY >= ROWS),
    );

  const canPlacePiece = (piece: Piece) =>
    canPlaceOnBlocks(piece, blocksRef.current);

  const canPlaceOnBlocks = (piece: Piece, blocks: Map<string, Brick>) =>
    piece.shape.every((row, rowY) =>
      row.every((cell, colX) => {
        if (!cell) return true;
        const gx = piece.x + colX;
        const gy = piece.y + rowY;
        return gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS && !blocks.has(keyFor(gx, gy));
      }),
    );

  const placeIntoBlocks = (piece: Piece, blocks: Map<string, Brick>, pieceIndex: number) => {
    let placed = 0;
    const hp = 1 + currentParkourLevel.hpBonus + Math.floor(pieceIndex / 9) + Math.floor(blocks.size / 28);
    piece.shape.forEach((row, rowY) => {
      row.forEach((cell, colX) => {
        if (!cell) return;
        const gx = piece.x + colX;
        const gy = piece.y + rowY;
        if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return;
        const key = keyFor(gx, gy);
        if (blocks.has(key)) return;
        blocks.set(key, { color: piece.color, hp, shield: piece.shield ? shieldStrengthForLevel(currentParkourLevel.id) : 0 });
        placed += 1;
      });
    });
    return placed;
  };

  const completeParkourLines = (blocks: Map<string, Brick>) => {
    const completedKeys = new Set<string>();
    let completedLines = 0;

    for (let y = 0; y < ROWS; y += 1) {
      const keys = Array.from({ length: COLS }, (_, x) => keyFor(x, y));
      const full = keys.every((key) => blocks.has(key));
      const fresh = keys.some((key) => !blocks.get(key)?.completedWall);
      if (full && fresh) {
        completedLines += 1;
        keys.forEach((key) => completedKeys.add(key));
      }
    }

    for (let x = 0; x < COLS; x += 1) {
      const keys = Array.from({ length: ROWS }, (_, y) => keyFor(x, y));
      const full = keys.every((key) => blocks.has(key));
      const fresh = keys.some((key) => !blocks.get(key)?.completedWall);
      if (full && fresh) {
        completedLines += 1;
        keys.forEach((key) => completedKeys.add(key));
      }
    }

    if (completedKeys.size === 0) return { lines: 0, score: 0 };

    const wallShield = shieldStrengthForLevel(currentParkourLevel.id) + 1;
    completedKeys.forEach((key) => {
      const brick = blocks.get(key);
      if (!brick) return;
      brick.color = '#ffffff';
      brick.completedWall = true;
      brick.shield = Math.max(brick.shield || 0, wallShield);
      brick.hitFlash = 18;
      brick.hp = Math.max(brick.hp, 2 + currentParkourLevel.hpBonus);
      const { x, y } = parseKey(key);
      addImpactEffect(x, y, 'brickBreak', '#ffffff');
    });

    const score = completedLines * 420 + Math.max(0, completedLines - 1) * 260;
    soundManager.playLevelUp();
    return { lines: completedLines, score };
  };

  const findAutoPlacement = (piece: Piece, blocks: Map<string, Brick>, pieceIndex: number): Piece | null => {
    const rotations: number[][][] = [];
    let shape = piece.shape.map((row) => [...row]);
    for (let i = 0; i < 4; i += 1) {
      const signature = shape.map((row) => row.join('')).join('/');
      if (!rotations.some((existing) => existing.map((row) => row.join('')).join('/') === signature)) {
        rotations.push(shape.map((row) => [...row]));
      }
      shape = rotateShape(shape);
    }

    let bestPiece: Piece | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    rotations.forEach((candidateShape) => {
      const { width, height } = shapeSize(candidateShape);
      for (let y = 0; y <= ROWS - height; y += 1) {
        for (let x = 0; x <= COLS - width; x += 1) {
          const candidate = { ...piece, x, y, shape: candidateShape.map((row) => [...row]) };
          if (!canPlaceOnBlocks(candidate, blocks)) continue;
          let adjacency = 0;
          candidate.shape.forEach((row, rowY) => {
            row.forEach((cell, colX) => {
              if (!cell) return;
              const gx = x + colX;
              const gy = y + rowY;
              if (blocks.has(keyFor(gx - 1, gy))) adjacency += 1;
              if (blocks.has(keyFor(gx + 1, gy))) adjacency += 1;
              if (blocks.has(keyFor(gx, gy - 1))) adjacency += 1;
              if (blocks.has(keyFor(gx, gy + 1))) adjacency += 1;
            });
          });
          const centerDistance = Math.abs(x + width / 2 - COLS / 2);
          const bandTargets = [ROWS * 0.18, ROWS * 0.38, ROWS * 0.62, ROWS * 0.82];
          const targetY = bandTargets[(pieceIndex + currentParkourLevel.id) % bandTargets.length];
          const targetX = ((pieceIndex * 5 + currentParkourLevel.id * 3) % COLS) + 0.5;
          const verticalSpread = Math.abs(y + height / 2 - targetY);
          const horizontalSpread = Math.abs(x + width / 2 - targetX);
          const randomJitter = Math.random() * 16;
          const score =
            adjacency * 8
            - centerDistance * 0.35
            - verticalSpread * 7.5
            - horizontalSpread * 1.1
            + randomJitter;
          if (score > bestScore) {
            bestPiece = candidate;
            bestScore = score;
          }
        }
      }
    });

    return bestPiece;
  };

  const movePiece = (dx: number) => {
    const piece = activePieceRef.current;
    if (canOccupy(piece, piece.x + dx, piece.y)) piece.x += dx;
  };

  const rotatePiece = () => {
    const piece = activePieceRef.current;
    const rotated = rotateShape(piece.shape);
    if (canOccupy(piece, piece.x, piece.y, rotated)) piece.shape = rotated;
  };

  const stepPiece = () => {
    const piece = activePieceRef.current;
    if (isPiecePastBoard(piece)) {
      skipPiece();
      return;
    }
    if (canOccupy(piece, piece.x, piece.y + 1)) {
      piece.y += 1;
      return;
    }
    skipPiece();
  };

  const updateBuild = () => {
    dropTimerRef.current += 1;
    if (dropTimerRef.current < currentParkourLevel.dropInterval) return;
    dropTimerRef.current = 0;
    stepPiece();
  };

  const spawnNextPiece = () => {
    setPiecesUsed((current) => {
      const next = current + 1;
      if (next >= buildBlockLimit) startShooting();
      else {
        activePieceRef.current = clonePiece(nextPieceRef.current);
        nextPieceRef.current = makeRandomPiece();
        setNextPiecePreview(clonePiece(nextPieceRef.current));
      }
      return Math.min(buildBlockLimit, next);
    });
  };

  const showPenalty = (penalty: number) => {
    if (penaltyTimerRef.current) window.clearTimeout(penaltyTimerRef.current);
    setLastPenalty(penalty);
    penaltyTimerRef.current = window.setTimeout(() => setLastPenalty(null), 950);
  };

  const skipPiece = () => {
    if (modeRef.current !== 'BUILD') return;
    const penalty = pieceSkipPenalty(activePieceRef.current);
    setScore((value) => value - penalty);
    showPenalty(penalty);
    spawnNextPiece();
  };

  const placePiece = () => {
    const piece = activePieceRef.current;
    if (!canPlacePiece(piece)) return;
    const nextBlocks = new Map(blocksRef.current);
    const placed = placeIntoBlocks(piece, nextBlocks, piecesUsed);
    if (placed === 0) return;
    const completion = completeParkourLines(nextBlocks);
    blocksRef.current = nextBlocks;
    setBlockCount(nextBlocks.size);
    if (completion.score > 0) setScore((value) => value + completion.score);
    spawnNextPiece();
  };

  const autoBuildParkour = () => {
    if (modeRef.current !== 'BUILD') return;
    const nextBlocks = new Map(blocksRef.current);
    let penalty = 0;
    let placedPieces = 0;
    let used = piecesUsed;
    let piece = clonePiece(activePieceRef.current);

    while (used < buildBlockLimit) {
      const placement = findAutoPlacement(piece, nextBlocks, used);
      if (placement) {
        placeIntoBlocks(placement, nextBlocks, used);
        placedPieces += 1;
      } else {
        penalty += pieceSkipPenalty(piece);
      }

      used += 1;
      if (used >= buildBlockLimit) break;
      piece = used === piecesUsed + 1 ? clonePiece(nextPieceRef.current) : makeRandomPiece();
    }

    const completion = completeParkourLines(nextBlocks);
    blocksRef.current = nextBlocks;
    activePieceRef.current = makeRandomPiece();
    nextPieceRef.current = makeRandomPiece();
    setNextPiecePreview(clonePiece(nextPieceRef.current));
    setPiecesUsed(buildBlockLimit);
    setBlockCount(nextBlocks.size);
    if (penalty > 0) {
      setScore((value) => value - penalty);
      showPenalty(penalty);
    }
    if (completion.score > 0) setScore((value) => value + completion.score);
    if (placedPieces > 0) soundManager.playSettle();
    if (nextBlocks.size > 0) {
      ballsRef.current = [];
      launchQueueRef.current = null;
      setShotsLeft(shotLimit);
      modeRef.current = 'SHOOT';
      setMode('SHOOT');
    } else {
      finishShooting('LOST');
    }
  };

  const startShooting = () => {
    if (blocksRef.current.size === 0) {
      finishShooting('LOST');
      return;
    }
    ballsRef.current = [];
    launchQueueRef.current = null;
    setShotsLeft(shotLimit);
    modeRef.current = 'SHOOT';
    setMode('SHOOT');
  };

  const finishShooting = (result: 'WON' | 'LOST') => {
    if (modeRef.current === result) return;
    modeRef.current = result;
    ballsRef.current = [];
    launchQueueRef.current = null;
    if (result === 'WON') setBlockCount(0);
    setMode(result);
  };

  const addImpactEffect = (gridX: number, gridY: number, kind: ShieldEffect['kind'], color = SHIELD_COLOR) => {
    const layout = layoutRef.current;
    shieldEffectsRef.current.push({
      x: layout.startX + gridX * layout.cell + layout.cell / 2,
      y: layout.startY + gridY * layout.cell + layout.cell / 2,
      age: 0,
      maxAge: kind === 'break' || kind === 'brickBreak' ? 24 : 12,
      kind,
      color,
    });
  };

  const continueToNextParkourLevel = () => {
    if (parkourLevel >= parkourLevels.length) {
      setView('PARKOUR_SELECT');
      return;
    }
    setParkourLevel(parkourLevel + 1);
  };

  const shoot = (clientX: number, clientY: number) => {
    if (modeRef.current !== 'SHOOT' || shotsLeft <= 0 || ballsRef.current.length > 0 || launchQueueRef.current) return;
    const origin = cannonOrigin();
    const dx = clientX - origin.x;
    const dy = clientY - origin.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const speed = 7.2;
    launchQueueRef.current = {
      remaining: volleySize,
      vx: (dx / length) * speed,
      vy: (dy / length) * speed,
      timer: 0,
    };
    setShotsLeft((value) => value - 1);
  };

  const cannonOrigin = () => ({
    x: window.innerWidth / 2,
    y: window.innerHeight - 72,
  });

  const updateShots = () => {
    const height = window.innerHeight;
    const layout = layoutRef.current;
    const wallLeft = layout.startX;
    const wallRight = layout.startX + layout.width;
    const wallTop = layout.startY;
    const queue = launchQueueRef.current;
    if (queue) {
      queue.timer += 1;
      if (queue.timer >= 5) {
        const origin = cannonOrigin();
        const ballRadius = Math.max(4, Math.min(7, layoutRef.current.cell * (window.innerWidth < 760 ? 0.16 : 0.18)));
        ballsRef.current.push({
          x: origin.x,
          y: origin.y,
          vx: queue.vx,
          vy: queue.vy,
          radius: ballRadius,
          alive: true,
          color: '#ffffff',
          hitFlash: 0,
          trail: [],
        });
        queue.remaining -= 1;
        queue.timer = 0;
        if (queue.remaining <= 0) launchQueueRef.current = null;
      }
    }

    ballsRef.current.forEach((ball) => {
      if (!ball.alive) return;
      ball.trail.unshift({ x: ball.x, y: ball.y });
      if (ball.trail.length > 5) ball.trail.pop();
      ball.x += ball.vx;
      ball.y += ball.vy;
      if (ball.x - ball.radius <= wallLeft) {
        ball.x = wallLeft + ball.radius;
        ball.vx = Math.abs(ball.vx);
      }
      if (ball.x + ball.radius >= wallRight) {
        ball.x = wallRight - ball.radius;
        ball.vx = -Math.abs(ball.vx);
      }
      if (ball.y - ball.radius <= wallTop) {
        ball.y = wallTop + ball.radius;
        ball.vy = Math.abs(ball.vy);
      }
      if (ball.y - ball.radius > height) ball.alive = false;
      collideBall(ball);
    });
    ballsRef.current = ballsRef.current.filter((ball) => ball.alive);
    if (blocksRef.current.size === 0) {
      finishShooting('WON');
      return;
    }
    if (shotsLeft <= 0 && ballsRef.current.length === 0 && !launchQueueRef.current && blocksRef.current.size > 0) {
      finishShooting('LOST');
    }
  };

  const collideBall = (ball: Ball) => {
    const layout = layoutRef.current;
    for (const [key, brick] of blocksRef.current) {
      const { x, y } = parseKey(key);
      const px = layout.startX + x * layout.cell;
      const py = layout.startY + y * layout.cell;
      const closestX = Math.max(px, Math.min(ball.x, px + layout.cell));
      const closestY = Math.max(py, Math.min(ball.y, py + layout.cell));
      const dx = ball.x - closestX;
      const dy = ball.y - closestY;
      if (dx * dx + dy * dy > ball.radius * ball.radius) continue;
      if (brick.shield && brick.shield > 0) {
        brick.shield -= 1;
        brick.hitFlash = 14;
        ball.alive = false;
        addImpactEffect(x, y, brick.shield > 0 ? 'hit' : 'break', SHIELD_COLOR);
        if (brick.shield > 0) soundManager.playShieldHit();
        else soundManager.playShieldBreak();
        setScore((value) => value + 16);
        return;
      }
      brick.hp -= 1;
      brick.hitFlash = 12;
      ball.hitFlash = 10;
      if (brick.hp <= 0) addImpactEffect(x, y, 'brickBreak', brick.color);
      if (brick.hp <= 0) {
        blocksRef.current.delete(key);
        soundManager.playBrickBreak();
      } else {
        soundManager.playBrickHit();
      }
      setBlockCount(blocksRef.current.size);
      setScore((value) => value + (brick.hp <= 0 ? 35 : 8));
      if (Math.abs(dx) > Math.abs(dy)) ball.vx *= -1;
      else ball.vy *= -1;
      ball.vx *= 1.01;
      ball.vy *= 1.01;
      return;
    }
  };

  const clearBuild = () => {
    const starterBricks = makeStarterBricks(currentParkourLevel);
    blocksRef.current = starterBricks;
    launchQueueRef.current = null;
    ballsRef.current = [];
    shieldEffectsRef.current = [];
    activePieceRef.current = makeRandomPiece();
    nextPieceRef.current = makeRandomPiece();
    setNextPiecePreview(clonePiece(nextPieceRef.current));
    setBlockCount(starterBricks.size);
    setPiecesUsed(0);
    setShotsLeft(currentParkourLevel.shotLimit);
    setScore(0);
    if (penaltyTimerRef.current) window.clearTimeout(penaltyTimerRef.current);
    setLastPenalty(null);
    modeRef.current = 'BUILD';
    setMode('BUILD');
  };

  const vibrate = (duration = 12) => {
    if ('vibrate' in navigator) navigator.vibrate(duration);
  };

  const stopHold = () => {
    if (!holdTimerRef.current) return;
    window.clearInterval(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const startHold = (action: () => void, repeat = false) => {
    stopHold();
    lastControlAtRef.current = Date.now();
    action();
    vibrate();
    if (!repeat) return;
    holdTimerRef.current = window.setInterval(action, 96);
  };

  const touchButtonProps = (action: () => void, repeat = false) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      startHold(action, repeat);
    },
    onPointerUp: stopHold,
    onPointerCancel: stopHold,
    onPointerLeave: stopHold,
    onClick: () => {
      if (Date.now() - lastControlAtRef.current < 180) return;
      action();
      vibrate();
    },
    onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault(),
  });

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);
    drawBackground(ctx, width, height);
    drawGrid(ctx);
    if (modeRef.current === 'BUILD') drawActivePiece(ctx);
    if (modeRef.current === 'SHOOT' || modeRef.current === 'WON' || modeRef.current === 'LOST') drawShooter(ctx);
    drawShieldEffects(ctx);
  };

  const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#12091f');
    gradient.addColorStop(0.55, '#080616');
    gradient.addColorStop(1, '#052020');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  };

  const drawGrid = (ctx: CanvasRenderingContext2D) => {
    const layout = layoutRef.current;
    const wallOffset = 7;
    ctx.strokeStyle = 'rgba(56, 247, 255, 0.42)';
    ctx.lineWidth = 2;
    ctx.strokeRect(layout.startX - 8, layout.startY - 8, layout.width + 16, layout.height + 16);
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#38f7ff';
    ctx.strokeStyle = 'rgba(56, 247, 255, 0.82)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(layout.startX - wallOffset, layout.startY - wallOffset);
    ctx.lineTo(layout.startX + layout.width + wallOffset, layout.startY - wallOffset);
    ctx.moveTo(layout.startX - wallOffset, layout.startY - wallOffset);
    ctx.lineTo(layout.startX - wallOffset, layout.startY + layout.height + wallOffset);
    ctx.moveTo(layout.startX + layout.width + wallOffset, layout.startY - wallOffset);
    ctx.lineTo(layout.startX + layout.width + wallOffset, layout.startY + layout.height + wallOffset);
    ctx.stroke();
    ctx.restore();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const px = layout.startX + x * layout.cell;
        const py = layout.startY + y * layout.cell;
        ctx.fillStyle = (x + y) % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.025)';
        ctx.fillRect(px, py, layout.cell - 1, layout.cell - 1);
      }
    }
    blocksRef.current.forEach((brick, key) => {
      const { x, y } = parseKey(key);
      drawBlock(ctx, x, y, brick.color, 1, brick.hp, false, brick.shield || 0, brick.hitFlash || 0);
      if (brick.hitFlash && brick.hitFlash > 0) brick.hitFlash -= 1;
    });
  };

  const drawActivePiece = (ctx: CanvasRenderingContext2D) => {
    const piece = activePieceRef.current;
    piece.shape.forEach((row, rowY) => {
      row.forEach((cell, colX) => {
        if (!cell) return;
        const gx = piece.x + colX;
        const gy = piece.y + rowY;
        const overlaps = blocksRef.current.has(keyFor(gx, gy));
        drawBlock(ctx, gx, gy, overlaps ? '#ff4f6d' : piece.color, overlaps ? 0.64 : 0.72, undefined, overlaps, piece.shield ? 1 : 0);
      });
    });
  };

  const drawBlock = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha: number, hp?: number, invalid = false, shield = 0, hitFlash = 0) => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
    const layout = layoutRef.current;
    const px = layout.startX + x * layout.cell + 4;
    const py = layout.startY + y * layout.cell + 4;
    const size = layout.cell - 8;
    const hitPulse = hitFlash > 0 ? hitFlash / 14 : 0;
    const shakeX = hitPulse > 0 ? Math.sin(hitFlash * 2.4 + x) * 2.2 * hitPulse : 0;
    const shakeY = hitPulse > 0 ? Math.cos(hitFlash * 2.1 + y) * 1.8 * hitPulse : 0;
    const drawX = px + shakeX;
    const drawY = py + shakeY;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowBlur = 14 + hitPulse * 24;
    ctx.shadowColor = color;
    ctx.fillRect(drawX, drawY, size, size);
    if (hitPulse > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.34 * hitPulse})`;
      ctx.fillRect(drawX, drawY, size, size);
    }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hitPulse > 0 ? `rgba(255,255,255,${0.72 + 0.26 * hitPulse})` : 'rgba(255,255,255,0.72)';
    ctx.lineWidth = hitPulse > 0 ? 2 : 1;
    ctx.strokeRect(drawX, drawY, size, size);
    ctx.lineWidth = 1;
    if (shield > 0) {
      const pulse = 0.55 + Math.sin(performance.now() / 130 + x * 0.7 + y * 0.9) * 0.28;
      const cx = drawX + size / 2;
      const cy = drawY + size / 2;
      ctx.fillStyle = `rgba(157, 232, 255, ${0.11 + pulse * 0.08})`;
      ctx.beginPath();
      ctx.roundRect(drawX - 5, drawY - 5, size + 10, size + 10, 9);
      ctx.fill();
      ctx.shadowBlur = 18 + pulse * 12;
      ctx.shadowColor = SHIELD_COLOR;
      ctx.strokeStyle = 'rgba(157, 232, 255, 0.92)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(drawX - 3, drawY - 3, size + 6, size + 6, 7);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.22 + pulse * 0.3})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, size * (0.45 + pulse * 0.08), 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, drawY + 3);
      ctx.lineTo(drawX + size - 5, cy);
      ctx.lineTo(cx, drawY + size - 3);
      ctx.lineTo(drawX + 5, cy);
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = SHIELD_COLOR;
      ctx.font = `900 ${Math.max(11, Math.floor(size * 0.3))}px Orbitron, Arial`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(String(shield), drawX + size - 4, drawY + 4);
      ctx.lineWidth = 1;
    }
    if (invalid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(drawX + 5, drawY + 5);
      ctx.lineTo(drawX + size - 5, drawY + size - 5);
      ctx.moveTo(drawX + size - 5, drawY + 5);
      ctx.lineTo(drawX + 5, drawY + size - 5);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    if (hp && alpha >= 1) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = color.toLowerCase() === '#ffffff' ? '#090616' : '#ffffff';
      ctx.font = `900 ${Math.max(12, Math.floor(size * 0.38))}px Orbitron, Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(hp), drawX + size / 2, drawY + size / 2);
    }
    ctx.globalAlpha = 1;
  };

  const drawShieldEffects = (ctx: CanvasRenderingContext2D) => {
    shieldEffectsRef.current = shieldEffectsRef.current.filter((effect) => effect.age < effect.maxAge);
    shieldEffectsRef.current.forEach((effect) => {
      const progress = effect.age / effect.maxAge;
      const alpha = 1 - progress;
      const isBreak = effect.kind === 'break' || effect.kind === 'brickBreak';
      const isShieldHit = effect.kind === 'hit';
      const color = effect.color || SHIELD_COLOR;
      const radius = isBreak ? 14 + progress * 30 : 8 + progress * 12;
      ctx.save();
      ctx.globalAlpha = isBreak ? alpha * 0.72 : alpha * 0.42;
      ctx.strokeStyle = isBreak ? '#ffffff' : color;
      ctx.shadowBlur = isBreak ? 16 : 8;
      ctx.shadowColor = color;
      ctx.lineWidth = isBreak ? 2.5 : 1.5;
      if (isBreak) {
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = color;
      for (let i = 0; i < (isBreak ? 5 : isShieldHit ? 3 : 0); i += 1) {
        const count = isBreak ? 5 : 3;
        const angle = (Math.PI * 2 * i) / count + progress * 0.55;
        const sparkDistance = (isBreak ? 10 : 7) + progress * (isBreak ? 30 : 16);
        const sparkSize = (isBreak ? 2.2 : 1.6) * alpha;
        ctx.beginPath();
        ctx.arc(effect.x + Math.cos(angle) * sparkDistance, effect.y + Math.sin(angle) * sparkDistance, sparkSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      effect.age += 1;
    });
  };

  const drawShooter = (ctx: CanvasRenderingContext2D) => {
    const origin = cannonOrigin();
    const aim = aimRef.current;
    const angle = Math.atan2(aim.y - origin.y, aim.x - origin.x);
    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.rotate(angle);
    ctx.fillStyle = '#44ff75';
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#44ff75';
    ctx.fillRect(0, -7, 58, 14);
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(aim.x, aim.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ballsRef.current.forEach((ball) => {
      drawBall(ctx, ball);
    });

    if (launchQueueRef.current) {
      ctx.fillStyle = '#ffd447';
      ctx.font = '900 13px Orbitron, Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`Volley ${launchQueueRef.current.remaining}`, origin.x, origin.y + 44);
    }
  };

  const drawBall = (ctx: CanvasRenderingContext2D, ball: Ball) => {
    ctx.save();

    ball.trail.forEach((point, index) => {
      const fade = 1 - index / Math.max(1, ball.trail.length);
      const radius = ball.radius * (0.18 + fade * 0.48);
      ctx.globalAlpha = fade * 0.12;
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 6 * fade;
      ctx.shadowColor = '#ffffff';
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;
    const redPulse = Math.max(0, ball.hitFlash) / 10;
    const halo = ctx.createRadialGradient(ball.x, ball.y, 2, ball.x, ball.y, ball.radius * 1.9);
    halo.addColorStop(0, redPulse > 0 ? `rgba(255, 69, 86, ${0.42 + redPulse * 0.28})` : 'rgba(255,255,255,0.38)');
    halo.addColorStop(0.42, redPulse > 0 ? `rgba(255, 47, 73, ${0.22 + redPulse * 0.28})` : 'rgba(255,255,255,0.18)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius * 1.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(ball.x, ball.y);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f7fbff';
    ctx.shadowBlur = redPulse > 0 ? 12 + redPulse * 10 : 9;
    ctx.shadowColor = redPulse > 0 ? '#ff2f49' : '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = redPulse > 0 ? 0.58 * redPulse : 0.18;
    ctx.fillStyle = '#ff2f49';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius * (0.62 + redPulse * 0.12), 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-ball.radius * 0.25, -ball.radius * 0.28, ball.radius * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = redPulse > 0 ? `rgba(255,47,73,${0.55 + redPulse * 0.35})` : 'rgba(255,255,255,0.64)';
    ctx.lineWidth = redPulse > 0 ? 2 : 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius + redPulse * 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    if (ball.hitFlash > 0) ball.hitFlash -= 1;
  };

  return (
    <main className="parkour-mode">
      <canvas
        ref={canvasRef}
        onPointerMove={(event) => {
          aimRef.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerDown={(event) => {
          aimRef.current = { x: event.clientX, y: event.clientY };
          shoot(event.clientX, event.clientY);
        }}
      />

      <header className="parkour-hud">
        <button type="button" onClick={() => setView('MENU')}>Menu</button>
        <div>
          <span className="label">Mod</span>
          <strong>{mode === 'BUILD' ? 'Dusurerek kur' : mode === 'SHOOT' ? 'Nisan al' : mode === 'WON' ? 'Temizlendi' : 'Hak bitti'}</strong>
        </div>
        <div>
          <span className="label">Blok</span>
          <strong>{blockCount}</strong>
        </div>
        <div>
          <span className="label">Parca</span>
          <strong>{piecesUsed}/{buildBlockLimit}</strong>
        </div>
        <div>
          <span className="label">Preblok</span>
          <strong>{currentParkourLevel.starterCells}</strong>
        </div>
        <div>
          <span className="label">Tur</span>
          <strong>{shotsLeft}</strong>
        </div>
        <div>
          <span className="label">Skor</span>
          <strong>{score}</strong>
        </div>
      </header>

      {lastPenalty !== null && (
        <div className="parkour-penalty">-{lastPenalty}</div>
      )}

      {mode === 'BUILD' && (
        <aside className="parkour-next" aria-label="Siradaki blok">
          <span className="label">{nextPiecePreview.shield ? 'Siradaki Kalkan' : 'Siradaki'}</span>
          <div className="parkour-next-grid">
            {nextPiecePreview.shape.map((row, rowY) => (
              <div className="parkour-next-row" key={`row-${rowY}`}>
                {row.map((cell, colX) => (
                  <span
                    className={cell ? `filled${nextPiecePreview.shield ? ' shielded' : ''}` : ''}
                    key={`${rowY}-${colX}`}
                    style={cell ? { backgroundColor: nextPiecePreview.color, boxShadow: `0 0 14px ${nextPiecePreview.color}` } : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
        </aside>
      )}

      {(mode === 'WON' || mode === 'LOST') && (
        <section className={`parkour-result ${mode === 'WON' ? 'won' : 'lost'}`}>
          {mode === 'WON' && <div className="result-burst" aria-hidden="true" />}
          <span className="label">{mode === 'WON' ? 'Parkur temizlendi' : 'Hak bitti'}</span>
          <strong>{mode === 'WON' ? 'Bolum Fethedildi' : 'Parkur Dayandi'}</strong>
          {mode === 'WON' && <div className="result-stars">{'*'.repeat(resultStars)}{'-'.repeat(5 - resultStars)}</div>}
          <div className="result-stats">
            <span><b>{score}</b> Skor</span>
            <span><b>{shotsLeft}</b> Tur</span>
            <span><b>{currentParkourLevel.id}</b> Bolum</span>
          </div>
          <p>{mode === 'WON' ? 'Tum hedefler dustu. Kurdugun parkur isini yapti.' : `${blockCount} blok ayakta kaldi. Daha keskin bir aci dene.`}</p>
          <div className="result-actions">
            {mode === 'WON' && (
              <button type="button" className="primary-action" onClick={continueToNextParkourLevel}>
                {parkourLevel >= parkourLevels.length ? 'Bolum Sec' : 'Sonraki Bolum'}
              </button>
            )}
            <button type="button" onClick={clearBuild}>Yeni Parkur</button>
            <button type="button" onClick={() => setView('PARKOUR_SELECT')}>Bolum Sec</button>
          </div>
        </section>
      )}

      <footer className="parkour-controls">
        {mode === 'BUILD' && (
          <>
            <button type="button" onClick={clearBuild}>Temizle</button>
            <button type="button" {...touchButtonProps(() => movePiece(-1), true)}>Sol</button>
            <button type="button" {...touchButtonProps(() => rotatePiece())}>Dondur</button>
            <button type="button" className="primary-action" {...touchButtonProps(() => placePiece())}>Yerlestir</button>
            <button type="button" {...touchButtonProps(() => stepPiece(), true)}>Asagi</button>
            <button type="button" {...touchButtonProps(() => movePiece(1), true)}>Sag</button>
            <button type="button" className="auto-action" onClick={autoBuildParkour}>Oto Kur</button>
            <button type="button" onClick={skipPiece}>Pas Gecir</button>
            <button type="button" onClick={startShooting} disabled={blockCount === 0}>Atis Modu</button>
          </>
        )}
        {mode !== 'BUILD' && (
          <>
            <button type="button" onClick={clearBuild}>Yeni Parkur</button>
            {mode === 'SHOOT' && (
              <button type="button" className="primary-action" onClick={startShooting} disabled={blockCount === 0}>Tekrar</button>
            )}
            {mode === 'WON' && (
              <button type="button" className="primary-action" onClick={continueToNextParkourLevel}>
                {parkourLevel >= parkourLevels.length ? 'Bolum Sec' : 'Sonraki'}
              </button>
            )}
            {mode === 'LOST' && (
              <button type="button" className="primary-action" onClick={startShooting} disabled={blockCount === 0}>Tekrar</button>
            )}
          </>
        )}
      </footer>
    </main>
  );
};

export default ParkourMode;
