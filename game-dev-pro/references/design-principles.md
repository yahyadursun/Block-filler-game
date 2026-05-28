# Frontend & Game Design Principles

## Visual Aesthetics
- **Color Theory**: Use high-contrast neon colors against dark backgrounds for arcade feel. 
    - Primary: #00d2ff (Cyan)
    - Secondary: #ff007f (Magenta)
    - Success: #00ff87 (Spring Green)
- **Glassmorphism**: 
    - `background: rgba(255, 255, 255, 0.05)`
    - `backdrop-filter: blur(10px)`
    - `border: 1px solid rgba(255, 255, 255, 0.1)`

## Game Feel (Juice)
- **Feedback**: Every action must have a visual reaction.
    - Block Settle: Add a slight scale-up animation and a glow pulse.
    - Level Transition: Fade out grid, show big "EXCELLENT" text, then fade in new grid.
- **Timing**: Use ease-out curves for UI transitions and ease-in for falling blocks.

## Code Quality
- **React + PixiJS**: Keep game logic in the Engine class, keep UI in React components.
- **State**: Use Zustand for cross-component game state (scores, levels).
- **TypeScript**: Always define interfaces for Game Events and Entity Data.
