import React, { useEffect, useRef } from 'react';
import { GameEngine } from '../game/Engine';
import { useGameStore } from '../store/useGameStore';
import '../styles/GameView.css';

const directionLabels = {
  DOWN: 'Asagi',
  UP: 'Yukari',
  LEFT: 'Sol',
  RIGHT: 'Sag',
};

const GameView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const lastControlAtRef = useRef(0);
  const gestureRef = useRef({ x: 0, y: 0, time: 0, moved: false });
  const {
    score,
    bestScore,
    level,
    currentLevel,
    linesCleared,
    whiteCells,
    misses,
    blocksSpawned,
    remainingBlocks,
    status,
    progress,
    cells,
    togglePause,
    setView,
    setLevel,
    resetGame,
    nextPieces,
  } = useGameStore();

  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      engineRef.current = new GameEngine(canvasRef.current);
    }

    return () => {
      if (holdTimerRef.current) window.clearInterval(holdTimerRef.current);
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.refreshBoard();
  }, [cells, level]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSoftDrop = event.code === 'KeyS' || event.code === 'ArrowDown';
      if (event.repeat && !isSoftDrop) return;
      if (status === 'PAUSED' && event.code !== 'KeyP' && event.code !== 'Escape') return;

      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          event.preventDefault();
          engineRef.current?.rotateActiveBlocks();
          break;
        case 'KeyA':
        case 'ArrowLeft':
          event.preventDefault();
          engineRef.current?.moveActiveBlocksSideways('LEFT');
          break;
        case 'KeyD':
        case 'ArrowRight':
          event.preventDefault();
          engineRef.current?.moveActiveBlocksSideways('RIGHT');
          break;
        case 'KeyS':
        case 'ArrowDown':
          event.preventDefault();
          engineRef.current?.accelerateActiveBlocks();
          break;
        case 'Space':
          event.preventDefault();
          engineRef.current?.attemptPlace();
          break;
        case 'KeyP':
          togglePause();
          break;
        case 'Escape':
          setView('LEVEL_SELECT');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setView, status, togglePause]);

  const continueToNextLevel = () => {
    setLevel(Math.min(20, level + 1));
    resetGame();
  };

  const retryLevel = () => {
    resetGame();
  };

  const vibrate = (duration = 12) => {
    if ('vibrate' in navigator) navigator.vibrate(duration);
  };

  const stopHold = () => {
    if (!holdTimerRef.current) return;
    window.clearInterval(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const startHold = (action: () => void, repeat = false) => {
    stopHold();
    lastControlAtRef.current = Date.now();
    action();
    vibrate();
    if (!repeat) return;
    holdTimerRef.current = window.setInterval(action, 82);
  };

  const touchButtonProps = (action: () => void, repeat = false) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      startHold(action, repeat);
    },
    onPointerUp: stopHold,
    onPointerCancel: stopHold,
    onPointerLeave: stopHold,
    onClick: () => {
      if (Date.now() - lastControlAtRef.current < 180) return;
      action();
      vibrate();
    },
    onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault(),
  });

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    gestureRef.current = { x: event.clientX, y: event.clientY, time: Date.now(), moved: false };
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 12) gesture.moved = true;
  };

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const elapsed = Date.now() - gesture.time;
    if (Math.max(absX, absY) < 12 && elapsed < 320) {
      engineRef.current?.rotateActiveBlocks();
      vibrate();
      return;
    }
    if (Math.max(absX, absY) < 24) return;
    if (absX > absY) {
      engineRef.current?.moveActiveBlocksSideways(dx < 0 ? 'LEFT' : 'RIGHT');
    } else if (dy > 0) {
      engineRef.current?.hardDropActiveBlock();
    } else {
      engineRef.current?.rotateActiveBlocks();
    }
    vibrate();
  };

  const totalCells = currentLevel.gridSize * currentLevel.gridSize;
  const usedBlocks = currentLevel.blockLimit - remainingBlocks;
  const boardProgress = Math.min(1, cells.size / totalCells);
  const visibleProgress = Math.max(progress, boardProgress);
  const progressWidth = visibleProgress > 0 ? Math.max(4, visibleProgress * 100) : 0;
  const deckRatio = remainingBlocks / currentLevel.blockLimit;
  const deckBarColor = deckRatio > 0.55 ? '#44ff75' : deckRatio > 0.25 ? '#ffd447' : '#ff4f6d';
  const deckBarWidth = remainingBlocks > 0 ? Math.max(3, deckRatio * 100) : 0;
  const deckState = deckRatio > 0.55 ? 'healthy' : deckRatio > 0.25 ? 'warning' : 'critical';

  return (
    <div className="game-container">
      <canvas
        ref={canvasRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={stopHold}
      />

      <header className="game-hud">
        <button className="icon-btn back" type="button" onClick={() => setView('LEVEL_SELECT')} aria-label="Bolum sec">
          <span aria-hidden="true">‹</span>
        </button>

        <div className="hud-stat">
          <span className="label">Skor</span>
          <strong>{score}</strong>
        </div>
        <div className="hud-stat">
          <span className="label">Bolum</span>
          <strong>{level}</strong>
        </div>
        <div className="hud-stat hide-mobile">
          <span className="label">Kalan Blok</span>
          <strong>{remainingBlocks}</strong>
        </div>

        <button className="pause-btn" type="button" onClick={togglePause}>
          {status === 'PAUSED' ? 'Devam' : 'Duraklat'}
        </button>
      </header>

      <aside className="objective-panel">
        <div>
          <span className="label">Hedef</span>
          <strong>
            {whiteCells}/{totalCells} beyaz
          </strong>
        </div>
        <div className="remaining-blocks">
          <span className="label">Kalan Blok</span>
          <strong>{remainingBlocks}</strong>
        </div>
        <div className="progress-track" aria-hidden="true">
          <span style={{ width: `${progressWidth}%` }} />
        </div>
        <div className="progress-readout">
          <span>Tahta: {cells.size}/{totalCells}</span>
          <span>Beyaz: {Math.round(progress * 100)}%</span>
        </div>
        <div className="level-meta">
          <span>{currentLevel.gridSize}x{currentLevel.gridSize}</span>
          <span>{currentLevel.directions.map((dir) => directionLabels[dir]).join(' / ')}</span>
          <span>Hazir: {currentLevel.starterCells}</span>
          <span>Cizgi: {linesCleared}</span>
          <span>Blok: {usedBlocks}/{currentLevel.blockLimit}</span>
          <span>Kacan: {misses}</span>
          <span>Rekor: {bestScore}</span>
        </div>
      </aside>

      <aside className={`next-panel ${deckState}`}>
        <div className="next-panel-header">
          <span className="label">Siradaki</span>
          <strong>{remainingBlocks} blok</strong>
        </div>
        <div className="deck-meter" aria-label="Kalan blok deposu">
          <span
            style={{
              width: `${deckBarWidth}%`,
              backgroundColor: deckBarColor,
              boxShadow: `0 0 16px ${deckBarColor}88`,
            }}
          />
        </div>
        <div className="deck-readout">
          {remainingBlocks}/{currentLevel.blockLimit}
        </div>
        <div className="queue-list">
          {nextPieces.map((piece, index) => (
            <div key={piece.id} className="queue-item" title={piece.name}>
              <span className="queue-count">
                No {blocksSpawned + index + 1}/{currentLevel.blockLimit}
              </span>
              <div className="preview-grid">
                {piece.shape.map((row, y) => (
                  <div key={y} className="preview-row">
                    {row.map((cell, x) => (
                      <span
                        key={x}
                        className="preview-cell"
                        style={{
                          backgroundColor: cell ? piece.color : 'transparent',
                          boxShadow: cell ? `0 0 10px ${piece.color}99` : 'none',
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <footer className="touch-controls" aria-label="Oyun kontrolleri">
        <button type="button" data-control-label="‹" {...touchButtonProps(() => engineRef.current?.moveActiveBlocksSideways('LEFT'), true)} aria-label="Sola kaydir">
          ←
        </button>
        <button type="button" data-control-label="↻" {...touchButtonProps(() => engineRef.current?.rotateActiveBlocks())} aria-label="Dondur">
          ↻
        </button>
        <button type="button" data-control-label="◆" className="primary-action" {...touchButtonProps(() => engineRef.current?.attemptPlace())} aria-label="Yerlestir">
          KOY
        </button>
        <button type="button" data-control-label="⌄" {...touchButtonProps(() => engineRef.current?.accelerateActiveBlocks(), true)} aria-label="Hizlandir">
          ↓
        </button>
        <button type="button" data-control-label="›" {...touchButtonProps(() => engineRef.current?.moveActiveBlocksSideways('RIGHT'), true)} aria-label="Saga kaydir">
          →
        </button>
      </footer>

      {(status === 'PAUSED' || status === 'LEVEL_COMPLETE' || status === 'GAME_OVER') && (
        <div className="state-overlay" role="dialog" aria-modal="true">
          <div className="state-panel">
            <span className="label">{status === 'LEVEL_COMPLETE' ? 'Basarili' : status === 'GAME_OVER' ? 'Oyun bitti' : 'Duraklatildi'}</span>
            <h2>
              {status === 'LEVEL_COMPLETE'
                ? `Bolum ${level} tamamlandi`
                : status === 'GAME_OVER'
                  ? 'Bloklar bitti'
                  : 'Nefes zamani'}
            </h2>
            <p>
          {status === 'LEVEL_COMPLETE'
                ? 'Tahtanin tum hucreleri beyaza dondu. Yildizlar kalan blok ve kacirilan blok sayisina gore hesaplandi.'
                : status === 'GAME_OVER'
                  ? 'Bu bolumun blok hakki bitti. Daha az blok kacirip bos alanlara daha verimli yerlestirmeyi dene.'
                  : 'P tusu veya Devam ile oyuna donebilirsin.'}
            </p>
            <div className="state-actions">
              {status === 'LEVEL_COMPLETE' && level < 20 && (
                <button type="button" className="primary-action" onClick={continueToNextLevel}>
                  Sonraki
                </button>
              )}
              {status === 'GAME_OVER' && (
                <button type="button" className="primary-action" onClick={retryLevel}>
                  Tekrar
                </button>
              )}
              {status === 'PAUSED' && (
                <button type="button" className="primary-action" onClick={togglePause}>
                  Devam
                </button>
              )}
              <button type="button" onClick={() => setView('LEVEL_SELECT')}>
                Bolumler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameView;
