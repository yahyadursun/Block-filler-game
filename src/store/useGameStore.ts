import { create } from 'zustand';
import type { Direction, GameStatus, LevelData, NextPiece, ParkourLevelData } from '../types/game';

type View = 'MENU' | 'LEVEL_SELECT' | 'GAME' | 'PARKOUR_SELECT' | 'PARKOUR';

interface AutoClearResult {
  x: number;
  y: number;
  erased: number;
}

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
  missStreak: number;
  blocksSpawned: number;
  bombCharges: number;
  rowClearCharges: number;
  columnClearCharges: number;
  queueDesignerCharges: number;
  status: GameStatus;
  cells: Map<string, number>;
  levels: LevelData[];
  parkourLevels: ParkourLevelData[];
  nextPieces: NextPiece[];

  gridSize: number;
  gridWidth: number;
  gridHeight: number;
  currentLevel: LevelData;
  currentParkourLevel: ParkourLevelData;
  progress: number;
  remainingBlocks: number;
  isPaused: boolean;

  setView: (view: View) => void;
  setLevel: (level: number) => void;
  setParkourLevel: (level: number) => void;
  completeParkourLevel: (stars: number) => void;
  addPlacementScore: (cells: number) => void;
  addCompletedLines: (lines: number) => void;
  registerMiss: () => AutoClearResult | null;
  registerBlockSpawned: () => void;
  registerBlockConsumed: () => void;
  togglePause: () => void;
  fillCells: (cells: { x: number; y: number }[], color: number) => void;
  detonateBomb: (x: number, y: number) => number;
  clearLine: (axis: 'ROW' | 'COLUMN', index: number) => number;
  consumeQueueDesigner: () => boolean;
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
  return ['DOWN', 'UP'];
};

const makeLevel = (index: number): LevelData => {
  const id = index + 1;
  const gridSize = Math.min(10, 7 + Math.floor(index / 3));
  const gridHeight = Math.min(12, gridSize + 3);
  const verticalBoardAllowance = Math.ceil((gridHeight - gridSize) * gridSize * 0.45);
  return {
    id,
    unlocked: true,
    stars: 0,
    difficulty: 1 + index * 0.18,
    gridSize,
    directions: directionPlan(id),
    speed: 51,
    blockLimit: Math.min(150, 44 + index * 3 + Math.floor(index / 3) * 7 + verticalBoardAllowance),
    starterCells: id <= 3 ? 0 : Math.min(Math.floor(gridSize * gridHeight * 0.3), 5 + (id - 4) * 3),
  };
};

const initialLevels = Array.from({ length: 20 }, (_, i) => makeLevel(i));

export const getLevelBoardDimensions = (level: LevelData) => ({
  width: level.gridSize,
  height: Math.min(12, level.gridSize + 3),
});

const makeParkourLevel = (index: number): ParkourLevelData => {
  const id = index + 1;
  const presets = [
    { targetBricks: 34, volleySize: 14, shotLimit: 7, hpBonus: 0, starterCells: 8 },
    { targetBricks: 42, volleySize: 17, shotLimit: 7, hpBonus: 0, starterCells: 12 },
    { targetBricks: 50, volleySize: 21, shotLimit: 7, hpBonus: 1, starterCells: 16 },
    { targetBricks: 60, volleySize: 25, shotLimit: 6, hpBonus: 1, starterCells: 20 },
    { targetBricks: 70, volleySize: 30, shotLimit: 6, hpBonus: 2, starterCells: 24 },
    { targetBricks: 80, volleySize: 36, shotLimit: 6, hpBonus: 2, starterCells: 28 },
    { targetBricks: 90, volleySize: 43, shotLimit: 5, hpBonus: 3, starterCells: 32 },
    { targetBricks: 100, volleySize: 50, shotLimit: 5, hpBonus: 3, starterCells: 36 },
    { targetBricks: 112, volleySize: 58, shotLimit: 5, hpBonus: 4, starterCells: 40 },
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

const makeStarterCells = (level: LevelData, gridWidth: number, gridHeight: number) => {
  const cells = new Map<string, number>();
  if (level.starterCells <= 0) return cells;

  const random = seededRandom(level.id * 9973 + gridWidth * 37 + gridHeight * 53);
  const addCell = (x: number, y: number) => {
    if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return;
    if (cells.size >= level.starterCells) return;
    const color = STARTER_COLORS[(x + y + level.id) % STARTER_COLORS.length];
    cells.set(`${x},${y}`, color);
  };

  const lanes = Math.max(2, Math.min(5, Math.floor(level.id / 3)));
  for (let i = 0; i < lanes && cells.size < level.starterCells; i += 1) {
    const horizontal = i % 2 === 0;
    const lineLimit = horizontal ? gridHeight : gridWidth;
    const pathLimit = horizontal ? gridWidth : gridHeight;
    const line = Math.floor(random() * lineLimit);
    const gap = Math.floor(random() * pathLimit);
    const length = Math.min(pathLimit - 1, 3 + Math.floor(random() * Math.max(2, pathLimit - 3)));
    const start = Math.floor(random() * Math.max(1, pathLimit - length + 1));

    for (let offset = 0; offset < length; offset += 1) {
      const pos = start + offset;
      if (pos === gap) continue;
      if (horizontal) addCell(pos, line);
      else addCell(line, pos);
    }
  }

  while (cells.size < level.starterCells) {
    const x = Math.floor(random() * gridWidth);
    const y = Math.floor(random() * gridHeight);
    addCell(x, y);
  }

  return new Map(
    Array.from(cells.entries()).filter(([key]) => {
      const [x, y] = key.split(',').map(Number);
      return x >= 0 && x < gridWidth && y >= 0 && y < gridHeight;
    }),
  );
};

const initialBoard = getLevelBoardDimensions(initialLevels[0]);

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
  missStreak: 0,
  blocksSpawned: 0,
  bombCharges: 1,
  rowClearCharges: 1,
  columnClearCharges: 1,
  queueDesignerCharges: 1,
  remainingBlocks: initialLevels[0].blockLimit,
  status: 'READY',
  cells: new Map<string, number>(),
  levels: initialLevels,
  parkourLevels: initialParkourLevels,
  nextPieces: [],
  currentLevel: initialLevels[0],
  currentParkourLevel: initialParkourLevels[0],
  gridSize: initialLevels[0].gridSize,
  gridWidth: initialBoard.width,
  gridHeight: initialBoard.height,
  progress: 0,
  isPaused: false,

  setView: (view) => set({ currentView: view }),
  setLevel: (level) =>
    set((state) => {
      const nextLevel = state.levels[Math.max(0, Math.min(state.levels.length - 1, level - 1))];
      const board = getLevelBoardDimensions(nextLevel);
      return {
        level,
        currentLevel: nextLevel,
        gridSize: nextLevel.gridSize,
        gridWidth: board.width,
        gridHeight: board.height,
        progress: 0,
        remainingBlocks: nextLevel.blockLimit,
        nextPieces: [],
      };
    }),
  setParkourLevel: (parkourLevel) =>
    set((state) => {
      const currentParkourLevel = state.parkourLevels[Math.max(0, Math.min(state.parkourLevels.length - 1, parkourLevel - 1))];
      return { parkourLevel, currentParkourLevel };
    }),
  completeParkourLevel: (stars) =>
    set((state) => {
      const parkourLevels = state.parkourLevels.map((level) => ({ ...level }));
      const current = parkourLevels[state.parkourLevel - 1];
      current.stars = Math.max(current.stars, stars);
      if (state.parkourLevel < parkourLevels.length) parkourLevels[state.parkourLevel].unlocked = true;
      return { parkourLevels, currentParkourLevel: current };
    }),

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
    set((state) => {
      const whiteCells = countWhiteCells(state.cells);
      return {
        score: state.score + lineScore + comboBonus,
        linesCleared: state.linesCleared + lines,
        whiteCells,
        progress: Math.min(1, whiteCells / (state.gridWidth * state.gridHeight)),
      };
    });
    if (get().whiteCells >= get().gridWidth * get().gridHeight) {
      get().completeLevel();
    }
  },

  registerMiss: () => {
    const state = get();
    const misses = state.misses + 1;
    const missStreak = state.missStreak + 1;
    if (missStreak < 5) {
      set({
        misses,
        missStreak,
        score: Math.max(0, state.score - 30),
      });
      return null;
    }
    if (state.cells.size === 0) {
      set({
        misses,
        missStreak: 0,
        score: Math.max(0, state.score - 30),
      });
      return null;
    }

    const cells = new Map(state.cells);
    const occupied = Array.from(cells.keys()).map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });
    const countArea = (x: number, y: number) => {
      let count = 0;
      for (let offsetY = -1; offsetY <= 2; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 2; offsetX += 1) {
          if (cells.has(`${x + offsetX},${y + offsetY}`)) count += 1;
        }
      }
      return count;
    };
    const isolated = occupied.find(({ x, y }) => countArea(x, y) === 1);
    const target =
      isolated ??
      occupied.reduce((best, candidate) => (countArea(candidate.x, candidate.y) > countArea(best.x, best.y) ? candidate : best));

    let erased = 0;
    for (let offsetY = -1; offsetY <= 2; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 2; offsetX += 1) {
        if (cells.delete(`${target.x + offsetX},${target.y + offsetY}`)) erased += 1;
      }
    }
    const whiteCells = countWhiteCells(cells);
    set({
      cells,
      misses,
      missStreak: 0,
      whiteCells,
      progress: Math.min(1, whiteCells / (state.gridWidth * state.gridHeight)),
      score: Math.max(0, state.score - 30) + erased * 25,
    });
    return { ...target, erased };
  },

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
      const status = state.status === 'PAUSED' ? 'PLAYING' : 'PAUSED';
      return { status, isPaused: status === 'PAUSED' };
    }),

  fillCells: (cells, color) =>
    set((state) => {
      const newCells = new Map(state.cells);
      cells.forEach((cell) => newCells.set(`${cell.x},${cell.y}`, color));
      return { cells: newCells };
    }),

  detonateBomb: (x, y) => {
    const state = get();
    if (state.bombCharges <= 0) return 0;
    const cells = new Map(state.cells);
    let erased = 0;
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const key = `${x + offsetX},${y + offsetY}`;
        if (cells.delete(key)) erased += 1;
      }
    }
    if (erased === 0) return 0;
    const whiteCells = countWhiteCells(cells);
    set({
      cells,
      bombCharges: state.bombCharges - 1,
      whiteCells,
      progress: Math.min(1, whiteCells / (state.gridWidth * state.gridHeight)),
      score: state.score + erased * 25,
    });
    return erased;
  },

  clearLine: (axis, index) => {
    const state = get();
    const charges = axis === 'ROW' ? state.rowClearCharges : state.columnClearCharges;
    if (charges <= 0) return 0;

    const cells = new Map(state.cells);
    let erased = 0;
    const length = axis === 'ROW' ? state.gridWidth : state.gridHeight;
    for (let offset = 0; offset < length; offset += 1) {
      const key = axis === 'ROW' ? `${offset},${index}` : `${index},${offset}`;
      if (!cells.has(key)) continue;
      cells.delete(key);
      erased += 1;
    }
    if (erased === 0) return 0;

    const whiteCells = countWhiteCells(cells);
    set({
      cells,
      whiteCells,
      progress: Math.min(1, whiteCells / (state.gridWidth * state.gridHeight)),
      score: state.score + erased * 25,
      ...(axis === 'ROW'
        ? { rowClearCharges: state.rowClearCharges - 1 }
        : { columnClearCharges: state.columnClearCharges - 1 }),
    });
    return erased;
  },

  consumeQueueDesigner: () => {
    const state = get();
    if (state.queueDesignerCharges <= 0) return false;
    set({ queueDesignerCharges: state.queueDesignerCharges - 1 });
    return true;
  },

  whitenCompletedLines: () => {
    const state = get();
    const toWhiten = new Set<string>();
    let cleared = 0;

    for (let y = 0; y < state.gridHeight; y += 1) {
      const keys = Array.from({ length: state.gridWidth }, (_, x) => `${x},${y}`);
      const full = keys.every((key) => state.cells.has(key));
      const hasNewColor = keys.some((key) => state.cells.get(key) !== 0xffffff);
      if (full && hasNewColor) {
        cleared += 1;
        keys.forEach((key) => toWhiten.add(key));
      }
    }

    for (let x = 0; x < state.gridWidth; x += 1) {
      const keys = Array.from({ length: state.gridHeight }, (_, y) => `${x},${y}`);
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
      const whiteCells = countWhiteCells(newCells);
      set({ cells: newCells, whiteCells, progress: Math.min(1, whiteCells / (state.gridWidth * state.gridHeight)) });
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
      return { levels: newLevels, bestScore, status: 'LEVEL_COMPLETE', isPaused: false };
    }),

  gameOver: () =>
    set((state) => {
      const bestScore = Math.max(state.bestScore, state.score);
      localStorage.setItem('block-filler-best', String(bestScore));
      return { bestScore, status: 'GAME_OVER', isPaused: false };
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
      const board = getLevelBoardDimensions(level);
      const cells = makeStarterCells(level, board.width, board.height);
      const whiteCells = countWhiteCells(cells);
      return {
        score: 0,
        linesCleared: 0,
        whiteCells,
        moves: 0,
        misses: 0,
        missStreak: 0,
        blocksSpawned: 0,
        bombCharges: 1,
        rowClearCharges: 1,
        columnClearCharges: 1,
        queueDesignerCharges: 1,
        remainingBlocks: level.blockLimit,
        status: 'PLAYING',
        isPaused: false,
        gridWidth: board.width,
        gridHeight: board.height,
        progress: Math.min(1, whiteCells / (board.width * board.height)),
        cells,
        nextPieces: [],
      };
    }),
}));
