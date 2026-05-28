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
  const {
    score,
    bestScore,
    level,
    currentLevel,
    linesCleared,
    whiteCells,
    misses,
    status,
    progress,
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
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
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

  return (
    <div className="game-container">
      <canvas ref={canvasRef} />

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
          <span className="label">Rekor</span>
          <strong>{bestScore}</strong>
        </div>

        <button className="pause-btn" type="button" onClick={togglePause}>
          {status === 'PAUSED' ? 'Devam' : 'Duraklat'}
        </button>
      </header>

      <aside className="objective-panel">
        <div>
          <span className="label">Hedef</span>
          <strong>
            {whiteCells}/{currentLevel.gridSize * currentLevel.gridSize} beyaz
          </strong>
        </div>
        <div className="progress-track" aria-hidden="true">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="level-meta">
          <span>{currentLevel.gridSize}x{currentLevel.gridSize}</span>
          <span>{currentLevel.directions.map((dir) => directionLabels[dir]).join(' / ')}</span>
          <span>Cizgi: {linesCleared}</span>
          <span>Hak: {Math.max(0, 3 - misses)}</span>
        </div>
      </aside>

      <aside className="next-panel">
        <span className="label">Siradaki</span>
        <div className="queue-list">
          {nextPieces.map((piece) => (
            <div key={piece.id} className="queue-item" title={piece.name}>
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
        <button type="button" onClick={() => engineRef.current?.moveActiveBlocksSideways('LEFT')} aria-label="Sola kaydir">
          ←
        </button>
        <button type="button" onClick={() => engineRef.current?.rotateActiveBlocks()} aria-label="Dondur">
          ↻
        </button>
        <button type="button" className="primary-action" onClick={() => engineRef.current?.attemptPlace()} aria-label="Yerlestir">
          PLACE
        </button>
        <button type="button" onClick={() => engineRef.current?.accelerateActiveBlocks()} aria-label="Hizlandir">
          ↓
        </button>
        <button type="button" onClick={() => engineRef.current?.moveActiveBlocksSideways('RIGHT')} aria-label="Saga kaydir">
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
                  ? 'Tahta kitlendi'
                  : 'Nefes zamani'}
            </h2>
            <p>
          {status === 'LEVEL_COMPLETE'
                ? 'Tahtanin tum hucreleri beyaza dondu. Sonraki bolum daha zor bir yon duzeni acacak.'
                : status === 'GAME_OVER'
                  ? 'Uc parca kacirdin. Bloklar dolu alanlardan gecebilir, ama sadece bos alana yerlestirilebilir.'
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
