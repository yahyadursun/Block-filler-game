# Arcade Juice: Visual & Audio Excellence

## Audio Strategy (Web Audio API)
- **Oscillators**: Use simple square waves for that retro feel.
- **Sfx Categories**:
    - `Move`: Short, high-pitch blip.
    - `Rotate`: Medium pitch slide.
    - `Place`: Deep, satisfying bass "thud" with a bit of noise.
    - `LevelUp`: Rising arpeggio.

## Advanced Visual Effects
- **Chromatic Aberration**: Slight red/blue offset on the edges of active blocks.
- **Screen Shake**: Intense shake on "Place", subtle vibration on "LevelUp".
- **Particles**:
    - `Square Particles`: On block settle, emit 5-10 small squares matching block color.
    - `Grid Pulse`: The grid should pulse cyan when a block is successfully placed.

## Cyberpunk UI Polish
- **Panels**: Use CSS `clip-path` for hexagonal corners.
- **Animations**:
    - `Glitch`: Use CSS `@keyframes` with `skew` and `clip`.
    - `Digital Typing`: Text should appear character by character.
