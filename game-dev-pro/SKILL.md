---
name: game-dev-pro
description: Expert guidance for frontend design and advanced game development. Use this skill when building UI components, implementing game mechanics (collision, physics, state), or applying professional visual styles like Glassmorphism and Neon aesthetics in React/PixiJS projects.
---

# Game Dev Pro

## Core Workflows

### 1. Visual Polish (The "Juice")
Apply professional design patterns to enhance user experience.
- Use **Glassmorphism** for HUD and Menus.
- Implement **Neon Glows** for interactive elements.
- Refer to `references/design-principles.md` for specific color palettes and CSS values.

### 2. Game Engine Architecture
Maintain a clean separation between rendering and state.
- **Engine (PixiJS)**: Handles the tick loop, collision detection, and raw graphics.
- **UI (React)**: Handles menus, overlays, and high-level navigation.
- **State (Zustand)**: Acts as the bridge between Engine and UI.

### 3. Cross-Platform Optimization
- **Mobile**: Ensure touch targets are at least 48x48dp. Use Capacitor for native integration.
- **Web**: Optimize assets for fast loading. Use WebGL for grid rendering.

## Reusable Resources
- `references/design-principles.md`: Comprehensive guide for colors, animations, and code standards.
