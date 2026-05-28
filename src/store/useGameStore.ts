import { create } from 'zustand';
import type { Direction, GameStatus, LevelData, NextPiece } from '../types/game';

type View = 'MENU' | 'LEVEL_SELECT' | 'GAME';

interface GameState {
  currentView: View;
  level: number;
  score: number;
  bestScore: number;
  linesCleared: number;
  whiteCells: number;
  moves: number;
  misses: number;
  status: GameStatus;
  cells: Map<string, number>;
  levels: LevelData[];
  nextPieces: NextPiece[];

  gridSize: number;
  currentLevel: LevelData;
  progress: number;
  isPaused: boolean;

  setView: (view: View) => void;
  setLevel: (level: number) => void;
  addPlacementScore: (cells: number) => void;
  addCompletedLines: (lines: number) => void;
  registerMiss: () => void;
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
  return {
    id,
    unlocked: index === 0,
    stars: 0,
    difficulty: 1 + index * 0.18,
    gridSize: Math.min(10, 7 + Math.floor(index / 3)),
    directions: directionPlan(id),
    speed: Math.max(10, 34 - index),
  };
};

const initialLevels = Array.from({ length: 20 }, (_, i) => makeLevel(i));

const getCurrentLevel = (state: Pick<GameState, 'levels' | 'level'>) =>
  state.levels[Math.max(0, Math.min(state.levels.length - 1, state.level - 1))];

const countWhiteCells = (cells: Map<string, number>) =>
  Array.from(cells.values()).filter((color) => color === 0xffffff).length;

export const useGameStore = create<GameState>((set, get) => ({
  currentView: 'MENU',
  level: 1,
  score: 0,
  bestScore: Number(localStorage.getItem('block-filler-best') || 0),
  linesCleared: 0,
  whiteCells: 0,
  moves: 0,
  misses: 0,
  status: 'READY',
  cells: new Map<string, number>(),
  levels: initialLevels,
  nextPieces: [],

  get currentLevel() {
    return getCurrentLevel(get());
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
  setLevel: (level) => set({ level }),

  addPlacementScore: (cells) =>
    set((state) => ({
      score: state.score + cells * 5,
      moves: state.moves + 1,
      status: state.status === 'READY' ? 'PLAYING' : state.status,
    })),

  addCompletedLines: (lines) => {
    if (lines <= 0) return;
    set((state) => ({
      score: state.score + lines * lines * 120,
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
        status: misses >= 3 ? 'GAME_OVER' : state.status,
      };
    }),

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
      const stars = state.misses === 0 ? 3 : state.misses === 1 ? 2 : 1;
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
    set({
      score: 0,
      linesCleared: 0,
      whiteCells: 0,
      moves: 0,
      misses: 0,
      status: 'PLAYING',
      cells: new Map(),
      nextPieces: [],
    }),
}));
