import { create } from 'zustand';
import type { Direction, GameStatus, LevelData, NextPiece, ParkourLevelData } from '../types/game';

type View = 'MENU' | 'LEVEL_SELECT' | 'GAME' | 'PARKOUR_SELECT' | 'PARKOUR';

interface GameState {
  currentView: View;
  level: number;
  parkourLevel: number;
  score: number;
  bestScore: number;
  linesCleared: number;
  whiteCells: number;
  moves: number;
  misses: number;
  blocksSpawned: number;
  status: GameStatus;
  cells: Map<string, number>;
  levels: LevelData[];
  parkourLevels: ParkourLevelData[];
  nextPieces: NextPiece[];

  gridSize: number;
  currentLevel: LevelData;
  currentParkourLevel: ParkourLevelData;
  progress: number;
  remainingBlocks: number;
  isPaused: boolean;

  setView: (view: View) => void;
  setLevel: (level: number) => void;
  setParkourLevel: (level: number) => void;
  addPlacementScore: (cells: number) => void;
  addCompletedLines: (lines: number) => void;
  registerMiss: () => void;
  registerBlockSpawned: () => void;
  registerBlockConsumed: () => void;
  togglePause: () => void;
  fillCells: (cells: { x: number; y: number }[], color: number) => void;
  whitenCompletedLines: () => number;
  unlockNextLevel: () => void;
  completeLevel: () => void;
  gameOver: () => void;
  setNextPieces: (pieces: NextPiece[]) => void;
  popNextPiece: () => NextPiece | null;
  resetGame: () => void;
}

const directionPlan = (level: number): Direction[] => {
  if (level <= 8) return ['DOWN'];
  if (level <= 12) return ['DOWN', 'UP'];
  if (level <= 16) return ['DOWN', 'UP', 'RIGHT'];
  return ['DOWN', 'UP', 'LEFT', 'RIGHT'];
};

const makeLevel = (index: number): LevelData => {
  const id = index + 1;
  const gridSize = Math.min(12, 7 + Math.floor(index / 3));
  return {
    id,
    unlocked: true,
    stars: 0,
    difficulty: 1 + index * 0.18,
    gridSize,
    directions: directionPlan(id),
    speed: Math.max(10, 34 - index),
    blockLimit: Math.min(150, 44 + index * 3 + Math.floor(index / 3) * 7),
    starterCells: id <= 3 ? 0 : Math.min(Math.floor(gridSize * gridSize * 0.3), 5 + (id - 4) * 3),
  };
};

const initialLevels = Array.from({ length: 20 }, (_, i) => makeLevel(i));

const makeParkourLevel = (index: number): ParkourLevelData => {
  const id = index + 1;
  const presets = [
    { buildBlockLimit: 24, volleySize: 14, shotLimit: 7, hpBonus: 0, dropInterval: 72, starterCells: 10 },
    { buildBlockLimit: 30, volleySize: 17, shotLimit: 7, hpBonus: 0, dropInterval: 68, starterCells: 18 },
    { buildBlockLimit: 36, volleySize: 21, shotLimit: 6, hpBonus: 1, dropInterval: 64, starterCells: 28 },
    { buildBlockLimit: 42, volleySize: 25, shotLimit: 6, hpBonus: 1, dropInterval: 60, starterCells: 40 },
    { buildBlockLimit: 48, volleySize: 30, shotLimit: 5, hpBonus: 2, dropInterval: 56, starterCells: 52 },
    { buildBlockLimit: 56, volleySize: 36, shotLimit: 5, hpBonus: 2, dropInterval: 52, starterCells: 66 },
    { buildBlockLimit: 64, volleySize: 43, shotLimit: 5, hpBonus: 3, dropInterval: 49, starterCells: 80 },
    { buildBlockLimit: 72, volleySize: 50, shotLimit: 4, hpBonus: 3, dropInterval: 46, starterCells: 96 },
    { buildBlockLimit: 82, volleySize: 58, shotLimit: 4, hpBonus: 4, dropInterval: 43, starterCells: 112 },
  ];
  const preset = presets[index] ?? presets[presets.length - 1];
  return {
    id,
    unlocked: true,
    stars: 0,
    ...preset,
  };
};

const initialParkourLevels = Array.from({ length: 9 }, (_, i) => makeParkourLevel(i));

const getCurrentLevel = (state: Pick<GameState, 'levels' | 'level'>) =>
  state.levels[Math.max(0, Math.min(state.levels.length - 1, state.level - 1))];

const getCurrentParkourLevel = (state: Pick<GameState, 'parkourLevels' | 'parkourLevel'>) =>
  state.parkourLevels[Math.max(0, Math.min(state.parkourLevels.length - 1, state.parkourLevel - 1))];

const countWhiteCells = (cells: Map<string, number>) =>
  Array.from(cells.values()).filter((color) => color === 0xffffff).length;

const STARTER_COLORS = [0x2166ff, 0xa855f7, 0x00b894, 0xff9f1c, 0xff4f6d];

const seededRandom = (seed: number) => {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
};

const makeStarterCells = (level: LevelData) => {
  const cells = new Map<string, number>();
  if (level.starterCells <= 0) return cells;

  const random = seededRandom(level.id * 9973 + level.gridSize * 37);
  const addCell = (x: number, y: number) => {
    if (x < 0 || x >= level.gridSize || y < 0 || y >= level.gridSize) return;
    if (cells.size >= level.starterCells) return;
    const color = STARTER_COLORS[(x + y + level.id) % STARTER_COLORS.length];
    cells.set(`${x},${y}`, color);
  };

  const lanes = Math.max(2, Math.min(5, Math.floor(level.id / 3)));
  for (let i = 0; i < lanes && cells.size < level.starterCells; i += 1) {
    const horizontal = i % 2 === 0;
    const line = Math.floor(random() * level.gridSize);
    const gap = Math.floor(random() * level.gridSize);
    const length = Math.min(level.gridSize - 1, 3 + Math.floor(random() * Math.max(2, level.gridSize - 3)));
    const start = Math.floor(random() * Math.max(1, level.gridSize - length + 1));

    for (let offset = 0; offset < length; offset += 1) {
      const pos = start + offset;
      if (pos === gap) continue;
      if (horizontal) addCell(pos, line);
      else addCell(line, pos);
    }
  }

  while (cells.size < level.starterCells) {
    const x = Math.floor(random() * level.gridSize);
    const y = Math.floor(random() * level.gridSize);
    addCell(x, y);
  }

  return new Map(
    Array.from(cells.entries()).filter(([key]) => {
      const [x, y] = key.split(',').map(Number);
      return x >= 0 && x < level.gridSize && y >= 0 && y < level.gridSize;
    }),
  );
};

export const useGameStore = create<GameState>((set, get) => ({
  currentView: 'MENU',
  level: 1,
  parkourLevel: 1,
  score: 0,
  bestScore: Number(localStorage.getItem('block-filler-best') || 0),
  linesCleared: 0,
  whiteCells: 0,
  moves: 0,
  misses: 0,
  blocksSpawned: 0,
  remainingBlocks: initialLevels[0].blockLimit,
  status: 'READY',
  cells: new Map<string, number>(),
  levels: initialLevels,
  parkourLevels: initialParkourLevels,
  nextPieces: [],

  get currentLevel() {
    return getCurrentLevel(get());
  },
  get currentParkourLevel() {
    return getCurrentParkourLevel(get());
  },
  get gridSize() {
    return get().currentLevel.gridSize;
  },
  get progress() {
    const totalCells = get().gridSize * get().gridSize;
    return Math.min(1, get().whiteCells / totalCells);
  },
  get isPaused() {
    return get().status === 'PAUSED';
  },

  setView: (view) => set({ currentView: view }),
  setLevel: (level) =>
    set((state) => {
      const nextLevel = state.levels[Math.max(0, Math.min(state.levels.length - 1, level - 1))];
      return { level, remainingBlocks: nextLevel.blockLimit };
    }),
  setParkourLevel: (parkourLevel) => set({ parkourLevel }),

  addPlacementScore: (cells) =>
    set((state) => ({
      score: state.score + cells * 5,
      moves: state.moves + 1,
      status: state.status === 'READY' ? 'PLAYING' : state.status,
    })),

  addCompletedLines: (lines) => {
    if (lines <= 0) return;
    const lineScore = lines * 140;
    const comboBonus = lines > 1 ? (lines - 1) * lines * 180 : 0;
    set((state) => ({
      score: state.score + lineScore + comboBonus,
      linesCleared: state.linesCleared + lines,
      whiteCells: countWhiteCells(state.cells),
    }));
    if (get().whiteCells >= get().gridSize * get().gridSize) {
      get().completeLevel();
    }
  },

  registerMiss: () =>
    set((state) => {
      const misses = state.misses + 1;
      return {
        misses,
        score: Math.max(0, state.score - 30),
      };
    }),

  registerBlockSpawned: () =>
    set((state) => {
      const level = getCurrentLevel(state);
      const blocksSpawned = Math.min(level.blockLimit, state.blocksSpawned + 1);
      return { blocksSpawned };
    }),

  registerBlockConsumed: () =>
    set((state) => ({
      remainingBlocks: Math.max(0, state.remainingBlocks - 1),
    })),

  togglePause: () =>
    set((state) => {
      if (state.status === 'LEVEL_COMPLETE' || state.status === 'GAME_OVER') return {};
      return { status: state.status === 'PAUSED' ? 'PLAYING' : 'PAUSED' };
    }),

  fillCells: (cells, color) =>
    set((state) => {
      const newCells = new Map(state.cells);
      cells.forEach((cell) => newCells.set(`${cell.x},${cell.y}`, color));
      return { cells: newCells };
    }),

  whitenCompletedLines: () => {
    const state = get();
    const toWhiten = new Set<string>();
    let cleared = 0;

    for (let y = 0; y < state.gridSize; y += 1) {
      const keys = Array.from({ length: state.gridSize }, (_, x) => `${x},${y}`);
      const full = keys.every((key) => state.cells.has(key));
      const hasNewColor = keys.some((key) => state.cells.get(key) !== 0xffffff);
      if (full && hasNewColor) {
        cleared += 1;
        keys.forEach((key) => toWhiten.add(key));
      }
    }

    for (let x = 0; x < state.gridSize; x += 1) {
      const keys = Array.from({ length: state.gridSize }, (_, y) => `${x},${y}`);
      const full = keys.every((key) => state.cells.has(key));
      const hasNewColor = keys.some((key) => state.cells.get(key) !== 0xffffff);
      if (full && hasNewColor) {
        cleared += 1;
        keys.forEach((key) => toWhiten.add(key));
      }
    }

    if (toWhiten.size > 0) {
      const newCells = new Map(state.cells);
      toWhiten.forEach((key) => newCells.set(key, 0xffffff));
      set({ cells: newCells, whiteCells: countWhiteCells(newCells) });
    }

    return cleared;
  },

  unlockNextLevel: () =>
    set((state) => {
      const newLevels = state.levels.map((lvl) => ({ ...lvl }));
      if (state.level < newLevels.length) newLevels[state.level].unlocked = true;
      return { levels: newLevels };
    }),

  completeLevel: () =>
    set((state) => {
      const newLevels = state.levels.map((lvl) => ({ ...lvl }));
      const current = newLevels[state.level - 1];
      const levelData = getCurrentLevel(state);
      const usedBlocks = levelData.blockLimit - state.remainingBlocks;
      const usedRatio = usedBlocks / Math.max(1, levelData.blockLimit);
      const usagePenalty = usedRatio <= 0.72 ? 0 : usedRatio <= 0.84 ? 1 : usedRatio <= 0.94 ? 2 : 3;
      const missPenalty = Math.min(3, state.misses);
      const stars = Math.max(1, 5 - usagePenalty - missPenalty);
      current.stars = Math.max(current.stars, stars);
      if (state.level < newLevels.length) newLevels[state.level].unlocked = true;
      const bestScore = Math.max(state.bestScore, state.score);
      localStorage.setItem('block-filler-best', String(bestScore));
      return { levels: newLevels, bestScore, status: 'LEVEL_COMPLETE' };
    }),

  gameOver: () =>
    set((state) => {
      const bestScore = Math.max(state.bestScore, state.score);
      localStorage.setItem('block-filler-best', String(bestScore));
      return { bestScore, status: 'GAME_OVER' };
    }),

  setNextPieces: (pieces) => set({ nextPieces: pieces }),
  popNextPiece: () => {
    const pieces = [...get().nextPieces];
    const next = pieces.shift();
    set({ nextPieces: pieces });
    return next || null;
  },

  resetGame: () =>
    set((state) => {
      const level = getCurrentLevel(state);
      return {
        score: 0,
        linesCleared: 0,
        whiteCells: 0,
        moves: 0,
        misses: 0,
        blocksSpawned: 0,
        remainingBlocks: level.blockLimit,
        status: 'PLAYING',
        cells: makeStarterCells(level),
        nextPieces: [],
      };
    }),
}));
