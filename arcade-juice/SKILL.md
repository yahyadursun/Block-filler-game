---
name: arcade-juice
description: Specialized guidance for adding 'juice' to arcade games. Focuses on advanced PixiJS particles, Web Audio API sound synthesis, and high-end Cyberpunk CSS/UI effects. Use when the user wants high-impact visual/audio updates.
---

# Arcade Juice

## Workflows

### 1. Retro Audio Synthesis
Instead of loading MP3s, use the Web Audio API for zero-latency, arcade-accurate sounds.
- Create a `SoundManager` utility.
- Use `OscillatorNode` (Square/Sawtooth) and `GainNode` for envelopes.

### 2. PixiJS Juice
Enhance the Game Engine with professional feedback loops.
- **Particles**: Create a particle emitter for block settle events.
- **Shake**: Implement a camera shake mechanism in the Engine's update loop.

### 3. High-End UI
- Apply **Glitch Overlays** to menus.
- Use **Hexagonal Clip-Paths** for all panels.
- Add **Scanline Overlays** with varying opacity.

## Resources
- `references/fx-guide.md`: Detailed implementation patterns for SFX and VFX.
