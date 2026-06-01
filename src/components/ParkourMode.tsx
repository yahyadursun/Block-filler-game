import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import type { ParkourLevelData } from '../types/game';
import { soundManager } from '../utils/SoundManager';
import '../styles/ParkourMode.css';

type Mode = 'SHOOT' | 'WON' | 'LOST';

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
  hitFlash?: number;
}

interface LaunchQueue {
  remaining: number;
  vx: number;
  vy: number;
  timer: number;
}

interface ImpactEffect {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  kind: 'brickHit' | 'brickBreak';
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
const keyFor = (x: number, y: number) => `${x},${y}`;
const parseKey = (key: string) => {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
};
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
    bricks.set(keyFor(x, y), { color: COLORS[(x + y + level.id) % COLORS.length], hp });
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

const makeAutomaticParkour = (level: ParkourLevelData) => {
  const bricks = makeStarterBricks(level);
  const random = seededRandom(level.id * 7919 + level.targetBricks * 41);
  const add = (x: number, y: number) => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS - 1 || bricks.size >= level.targetBricks) return;
    const hp = 1 + level.hpBonus + Math.floor(y / 4);
    bricks.set(keyFor(x, y), { color: COLORS[(x * 3 + y + level.id) % COLORS.length], hp });
  };

  const bands = Math.min(7, 3 + Math.floor(level.id / 2));
  for (let band = 0; band < bands && bricks.size < level.targetBricks; band += 1) {
    const y = 1 + ((band * 2 + level.id) % Math.max(2, ROWS - 2));
    const gap = (level.id * 3 + band * 5) % COLS;
    for (let x = band % 2; x < COLS; x += 1) {
      if (x === gap || (x + band + level.id) % Math.max(5, 9 - Math.floor(level.id / 2)) === 0) continue;
      add(x, y);
    }
  }

  while (bricks.size < level.targetBricks) {
    add(Math.floor(random() * COLS), Math.floor(random() * Math.max(3, ROWS - 1)));
  }
  return bricks;
};

const ParkourMode: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const modeRef = useRef<Mode>('SHOOT');
  const blocksRef = useRef(new Map<string, Brick>());
  const ballsRef = useRef<Ball[]>([]);
  const impactEffectsRef = useRef<ImpactEffect[]>([]);
  const launchQueueRef = useRef<LaunchQueue | null>(null);
  const shotsLeftRef = useRef(8);
  const scoreRef = useRef(0);
  const aimRef = useRef({ x: 0, y: 0 });
  const layoutRef = useRef<Layout>({ startX: 0, startY: 0, cell: 32, width: 0, height: 0 });
  const [mode, setMode] = useState<Mode>('SHOOT');
  const [blockCount, setBlockCount] = useState(0);
  const [shotsLeft, setShotsLeft] = useState(8);
  const [score, setScore] = useState(0);
  const { setView, currentParkourLevel, parkourLevel, parkourLevels, setParkourLevel, completeParkourLevel } = useGameStore();
  const targetBricks = currentParkourLevel.targetBricks;
  const volleySize = currentParkourLevel.volleySize;
  const resultStars = mode === 'WON' ? Math.min(5, Math.max(3, 3 + (shotsLeft > 0 ? 1 : 0) + (score >= 600 ? 1 : 0))) : 0;

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const parkourBricks = makeAutomaticParkour(currentParkourLevel);
    blocksRef.current = parkourBricks;
    launchQueueRef.current = null;
    ballsRef.current = [];
    impactEffectsRef.current = [];
    setBlockCount(parkourBricks.size);
    shotsLeftRef.current = currentParkourLevel.shotLimit;
    setShotsLeft(currentParkourLevel.shotLimit);
    scoreRef.current = 0;
    setScore(0);
    modeRef.current = 'SHOOT';
    setMode('SHOOT');
  }, [currentParkourLevel.id, currentParkourLevel.shotLimit, targetBricks]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') setView('MENU');
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
      if (modeRef.current === 'SHOOT') updateShots();
      draw(ctx, window.innerWidth, window.innerHeight);
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
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

  const finishShooting = (result: 'WON' | 'LOST') => {
    if (modeRef.current === result) return;
    modeRef.current = result;
    ballsRef.current = [];
    launchQueueRef.current = null;
    if (result === 'WON') {
      setBlockCount(0);
      completeParkourLevel(Math.min(5, 3 + (shotsLeftRef.current > 0 ? 1 : 0) + (scoreRef.current >= 600 ? 1 : 0)));
    }
    setMode(result);
  };

  const addImpactEffect = (gridX: number, gridY: number, kind: ImpactEffect['kind'], color = '#ffffff') => {
    const layout = layoutRef.current;
    impactEffectsRef.current.push({
      x: layout.startX + gridX * layout.cell + layout.cell / 2,
      y: layout.startY + gridY * layout.cell + layout.cell / 2,
      age: 0,
      maxAge: kind === 'brickBreak' ? 24 : 12,
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
    if (modeRef.current !== 'SHOOT' || shotsLeftRef.current <= 0 || ballsRef.current.length > 0 || launchQueueRef.current) return;
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
    setShotsLeft((value) => {
      const next = value - 1;
      shotsLeftRef.current = next;
      return next;
    });
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
    if (shotsLeftRef.current <= 0 && ballsRef.current.length === 0 && !launchQueueRef.current && blocksRef.current.size > 0) {
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
      setScore((value) => {
        const next = value + (brick.hp <= 0 ? 35 : 8);
        scoreRef.current = next;
        return next;
      });
      if (Math.abs(dx) > Math.abs(dy)) ball.vx *= -1;
      else ball.vy *= -1;
      ball.vx *= 1.01;
      ball.vy *= 1.01;
      return;
    }
  };

  const clearBuild = () => {
    const parkourBricks = makeAutomaticParkour(currentParkourLevel);
    blocksRef.current = parkourBricks;
    launchQueueRef.current = null;
    ballsRef.current = [];
    impactEffectsRef.current = [];
    setBlockCount(parkourBricks.size);
    shotsLeftRef.current = currentParkourLevel.shotLimit;
    setShotsLeft(currentParkourLevel.shotLimit);
    scoreRef.current = 0;
    setScore(0);
    modeRef.current = 'SHOOT';
    setMode('SHOOT');
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    aimRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    aimRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    aimRef.current = { x: event.clientX, y: event.clientY };
    shoot(event.clientX, event.clientY);
  };

  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.clearRect(0, 0, width, height);
    drawBackground(ctx, width, height);
    drawGrid(ctx);
    if (modeRef.current === 'SHOOT' || modeRef.current === 'WON' || modeRef.current === 'LOST') drawShooter(ctx);
    drawImpactEffects(ctx);
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
      drawBlock(ctx, x, y, brick.color, 1, brick.hp, false, brick.hitFlash || 0);
      if (brick.hitFlash && brick.hitFlash > 0) brick.hitFlash -= 1;
    });
  };

  const drawBlock = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha: number, hp?: number, invalid = false, hitFlash = 0) => {
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

  const drawImpactEffects = (ctx: CanvasRenderingContext2D) => {
    impactEffectsRef.current = impactEffectsRef.current.filter((effect) => effect.age < effect.maxAge);
    impactEffectsRef.current.forEach((effect) => {
      const progress = effect.age / effect.maxAge;
      const alpha = 1 - progress;
      const isBreak = effect.kind === 'brickBreak';
      const color = effect.color || '#ffffff';
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
      for (let i = 0; i < (isBreak ? 5 : 0); i += 1) {
        const count = 5;
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
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
      />

      <header className="parkour-hud">
        <button type="button" onClick={() => setView('MENU')}>Menu</button>
        <div>
          <span className="label">Mod</span>
          <strong>{mode === 'SHOOT' ? 'Nisan al' : mode === 'WON' ? 'Temizlendi' : 'Hak bitti'}</strong>
        </div>
        <div>
          <span className="label">Blok</span>
          <strong>{blockCount}</strong>
        </div>
        <div>
          <span className="label">Hedef</span>
          <strong>{targetBricks}</strong>
        </div>
        <div>
          <span className="label">Bolum</span>
          <strong>{currentParkourLevel.id}</strong>
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
          <p>{mode === 'WON' ? 'Tum hedefler dustu. Bolum temizlendi.' : `${blockCount} blok ayakta kaldi. Daha keskin bir aci dene.`}</p>
          <div className="result-actions">
            {mode === 'WON' && (
              <button type="button" className="primary-action" onClick={continueToNextParkourLevel}>
                {parkourLevel >= parkourLevels.length ? 'Bolum Sec' : 'Sonraki Bolum'}
              </button>
            )}
            <button type="button" onClick={clearBuild}>Tekrar Dene</button>
            <button type="button" onClick={() => setView('PARKOUR_SELECT')}>Bolum Sec</button>
          </div>
        </section>
      )}

      <footer className="parkour-controls">
        <button type="button" onClick={clearBuild}>Bastan Basla</button>
        {mode === 'WON' && (
          <button type="button" className="primary-action" onClick={continueToNextParkourLevel}>
            {parkourLevel >= parkourLevels.length ? 'Bolum Sec' : 'Sonraki'}
          </button>
        )}
        <button type="button" onClick={() => setView('PARKOUR_SELECT')}>Bolum Sec</button>
      </footer>
    </main>
  );
};

export default ParkourMode;
