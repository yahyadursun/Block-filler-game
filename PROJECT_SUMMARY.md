# Block Filler Game - Core Logic Summary

## Overview
Block Filler is a minimalist, dynamic puzzle game built with **PixiJS** and **React**. The game objective is to strategically place incoming blocks onto a grid to clear rows and columns.

## Core Mechanics

### 1. The Game Grid
- **Dynamic Sizing:** The grid starts at 7x7 and expands as levels progress, reaching a maximum of 10x10.
- **Rendering:** The grid is rendered using `PIXI.Graphics` and dynamic calculations to ensure it stays centered and scaled correctly within the viewport.
- **State Management:** Cell occupancy and color data are managed via `zustand` (`useGameStore`), providing a single source of truth for settled blocks and level progression.

### 2. Block Lifecycle
- **Spawning:** Blocks are generated from a pre-calculated queue. They spawn at the edge of the screen and move towards the center grid based on their direction (DOWN, UP, LEFT, RIGHT).
- **Movement:** Active blocks follow a fixed step interval. Players can rotate and maneuver these blocks before they are "settled."
- **Cleanup (Off-Screen):** Any block that exits the designated game area (grid + margin) without being placed is automatically removed from the engine's active loop. A visual/audio feedback (playError sound) signals this event.

### 3. Placement & Clearing
- **Settling:** When a player attempts to place a block, the engine verifies if the current shape can fit within the grid bounds and on top of existing cells.
- **Line Clearing:** Once a row or column is filled, the lines are cleared. Cleared cells turn white briefly (feedback) before disappearing, and the score increases.

### 4. Continuous Flow
- The game maintains a continuous state where new blocks are generated automatically through a `spawnTimer`. This prevents the game from stalling if the user doesn't place a block immediately, creating a constant challenge.

## Technical Architecture
- **Rendering Pipeline:** PixiJS (v8) handles all graphical output, utilizing a custom `PIXI.Filter` for scanline post-processing.
- **State:** `zustand` is used for global state management (grid size, score, cells, levels).
- **Audio:** `SoundManager` uses the Web Audio API to provide immediate auditory feedback for game actions (move, rotate, settle, level-up).
