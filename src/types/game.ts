export interface NextPiece {
    id: string;
    shape: number[][];
    color: string;
    pixiColor: number;
    name: string;
}

export interface LevelData {
    id: number;
    unlocked: boolean;
    stars: number;
    difficulty: number;
    gridSize: number;
    directions: Direction[];
    speed: number;
}

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export type GameStatus = 'READY' | 'PLAYING' | 'PAUSED' | 'LEVEL_COMPLETE' | 'GAME_OVER';
