import React, { useEffect, useRef, useState } from 'react';
import { GAME_SHAPES, GAME_SHAPE_NAMES, GameEngine } from '../game/Engine';
import { useGameStore } from '../store/useGameStore';
import '../styles/GameView.css';

type AbilityMode = 'BOMB' | 'ROW' | 'COLUMN' | null;

const GameView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const lastControlAtRef = useRef(0);
  const gestureRef = useRef({ x: 0, y: 0, time: 0, moved: false });
  const [abilityMode, setAbilityMode] = useState<AbilityMode>(null);
  const [queueEditorOpen, setQueueEditorOpen] = useState(false);
  const [plannedShapes, setPlannedShapes] = useState<string[]>([]);
  const [showCompletionResult, setShowCompletionResult] = useState(false);
  const {
    score,
    level,
    currentLevel,
    blocksSpawned,
    missStreak,
    bombCharges,
    rowClearCharges,
    columnClearCharges,
    queueDesignerCharges,
    remainingBlocks,
    status,
    cells,
    togglePause,
    setView,
    setLevel,
    resetGame,
    consumeQueueDesigner,
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
    if (status !== 'LEVEL_COMPLETE') return;
    const timer = window.setTimeout(() => setShowCompletionResult(true), 1900);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSoftDrop = event.code === 'KeyS' || event.code === 'ArrowDown';
      if (event.repeat && !isSoftDrop) return;
      if (queueEditorOpen) {
        if (event.code === 'Escape') {
          event.preventDefault();
          setQueueEditorOpen(false);
          setPlannedShapes([]);
          togglePause();
        }
        return;
      }
      if (abilityMode) {
        if (event.code === 'Escape') {
          event.preventDefault();
          setAbilityMode(null);
          togglePause();
        }
        return;
      }
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
  }, [abilityMode, queueEditorOpen, setView, status, togglePause]);

  const continueToNextLevel = () => {
    setAbilityMode(null);
    setQueueEditorOpen(false);
    setPlannedShapes([]);
    setShowCompletionResult(false);
    setLevel(Math.min(20, level + 1));
    resetGame();
  };

  const retryLevel = () => {
    setAbilityMode(null);
    setQueueEditorOpen(false);
    setPlannedShapes([]);
    setShowCompletionResult(false);
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
    if (abilityMode) {
      const applied =
        abilityMode === 'BOMB'
          ? engineRef.current?.detonateBombAtScreenPoint(event.clientX, event.clientY)
          : engineRef.current?.clearLineAtScreenPoint(abilityMode, event.clientX, event.clientY);
      if (applied) {
        setAbilityMode(null);
        togglePause();
        vibrate(36);
      }
      return;
    }
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
      engineRef.current?.activateSoftDrop();
    } else {
      engineRef.current?.rotateActiveBlocks();
    }
    vibrate();
  };

  const deckRatio = remainingBlocks / currentLevel.blockLimit;
  const deckBarColor = deckRatio > 0.55 ? '#44ff75' : deckRatio > 0.25 ? '#ffd447' : '#ff4f6d';
  const deckBarWidth = remainingBlocks > 0 ? Math.max(3, deckRatio * 100) : 0;
  const deckState = deckRatio > 0.55 ? 'healthy' : deckRatio > 0.25 ? 'warning' : 'critical';
  const toggleAbilityMode = (mode: Exclude<AbilityMode, null>, charges: number) => {
    if (charges <= 0 || (status !== 'PLAYING' && abilityMode !== mode)) return;
    setAbilityMode((active) => (active === mode ? null : mode));
    togglePause();
  };
  const queueSlotCount = nextPieces.length;
  const openQueueEditor = () => {
    if (queueDesignerCharges <= 0 || status !== 'PLAYING' || queueSlotCount === 0) return;
    setPlannedShapes([]);
    setQueueEditorOpen(true);
    togglePause();
  };
  const closeQueueEditor = () => {
    setQueueEditorOpen(false);
    setPlannedShapes([]);
    togglePause();
  };
  const applyQueuePlan = () => {
    if (plannedShapes.length !== queueSlotCount) return;
    if (!engineRef.current?.replaceUpcomingShapes(plannedShapes)) return;
    consumeQueueDesigner();
    setQueueEditorOpen(false);
    setPlannedShapes([]);
    togglePause();
    vibrate(28);
  };

  return (
    <div className={`game-container${abilityMode ? ' ability-active' : ''}`}>
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
        <button className="pause-btn" type="button" onClick={togglePause} disabled={Boolean(abilityMode)}>
          {status === 'PAUSED' ? 'Devam' : 'Duraklat'}
        </button>
        <aside className={`next-panel ${deckState}`}>
        <div className="next-panel-header">
          <span className="label">Siradaki 5 Blok</span>
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
              <span className="queue-order">{index + 1}</span>
              <span className="queue-count">No {blocksSpawned + index + 1}</span>
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
      </header>

      <div className={`miss-streak-alert${missStreak >= 4 ? ' critical' : ''}`}>
        <span className="label">Atlanan</span>
        <strong>{missStreak}/5</strong>
        <span className="miss-streak-meter" aria-label={`Atlanan blok serisi ${missStreak}/5`}>
          <span style={{ width: `${(missStreak / 5) * 100}%` }} />
        </span>
      </div>

      <aside className="ability-dock" aria-label="Yetenekler">
        <span className="dock-label">Yetenekler</span>
        <button
          className={`ability-toggle bomb-toggle${abilityMode === 'BOMB' ? ' active' : ''}`}
          type="button"
          onClick={() => toggleAbilityMode('BOMB', bombCharges)}
          disabled={bombCharges <= 0 || (status !== 'PLAYING' && abilityMode !== 'BOMB')}
          aria-pressed={abilityMode === 'BOMB'}
          aria-label={`Bomba gucu, ${bombCharges} hak`}
          title="Bomba gucu"
        >
          <span className="bomb-icon" aria-hidden="true" />
          <span>Bomba</span>
          <strong>{bombCharges}</strong>
        </button>
        <button
          className={`ability-toggle row-clear-toggle${abilityMode === 'ROW' ? ' active' : ''}`}
          type="button"
          onClick={() => toggleAbilityMode('ROW', rowClearCharges)}
          disabled={rowClearCharges <= 0 || (status !== 'PLAYING' && abilityMode !== 'ROW')}
          aria-pressed={abilityMode === 'ROW'}
          aria-label={`Satir silici, ${rowClearCharges} hak`}
          title="Satir silici"
        >
          <span className="line-power-icon row" aria-hidden="true" />
          <span>Satir</span>
          <strong>{rowClearCharges}</strong>
        </button>
        <button
          className={`ability-toggle column-clear-toggle${abilityMode === 'COLUMN' ? ' active' : ''}`}
          type="button"
          onClick={() => toggleAbilityMode('COLUMN', columnClearCharges)}
          disabled={columnClearCharges <= 0 || (status !== 'PLAYING' && abilityMode !== 'COLUMN')}
          aria-pressed={abilityMode === 'COLUMN'}
          aria-label={`Sutun silici, ${columnClearCharges} hak`}
          title="Sutun silici"
        >
          <span className="line-power-icon column" aria-hidden="true" />
          <span>Sutun</span>
          <strong>{columnClearCharges}</strong>
        </button>
        <button
          className="ability-toggle queue-designer-toggle"
          type="button"
          onClick={openQueueEditor}
          disabled={queueDesignerCharges <= 0 || status !== 'PLAYING' || nextPieces.length === 0}
          aria-label={`Sirayi kur, ${queueDesignerCharges} hak`}
          title="Sonraki bloklari sec"
        >
          <span className="queue-power-icon" aria-hidden="true" />
          <span>Sira</span>
          <strong>{queueDesignerCharges}</strong>
        </button>
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

      {queueEditorOpen && (
        <div className="queue-editor-overlay" role="dialog" aria-modal="true" aria-label="Sonraki bloklari sec">
          <section className="queue-editor">
            <header>
              <div>
                <span className="label">Yetenek</span>
                <h2>Sonraki bloklari sec</h2>
              </div>
              <button type="button" className="queue-editor-close" onClick={closeQueueEditor} aria-label="Kapat">X</button>
            </header>
            <div className="shape-catalog">
              {GAME_SHAPE_NAMES.map((name) => (
                <button
                  type="button"
                  className="shape-choice"
                  key={name}
                  onClick={() => {
                    if (plannedShapes.length < queueSlotCount) setPlannedShapes((current) => [...current, name]);
                  }}
                  disabled={plannedShapes.length >= queueSlotCount}
                  title={name}
                >
                  <span className="shape-name">{name}</span>
                  <span className="shape-mini-grid">
                    {GAME_SHAPES[name].map((row, y) => (
                      <span className="shape-mini-row" key={`${name}-${y}`}>
                        {row.map((cell, x) => <span className={cell ? 'filled' : ''} key={`${name}-${y}-${x}`} />)}
                      </span>
                    ))}
                  </span>
                </button>
              ))}
            </div>
            <div className="queue-editor-slots" aria-label="Secilen blok sirasi">
              {Array.from({ length: queueSlotCount }, (_, index) => {
                const name = plannedShapes[index];
                return (
                  <button
                    type="button"
                    className={`queue-editor-slot${name ? ' filled' : ''}`}
                    key={index}
                    onClick={() => setPlannedShapes((current) => current.filter((_, slotIndex) => slotIndex !== index))}
                    disabled={!name}
                    aria-label={name ? `${index + 1}. slot ${name}, kaldir` : `${index + 1}. slot bos`}
                  >
                    <b>{index + 1}</b>
                    {name ? (
                      <span className="shape-mini-grid">
                        {GAME_SHAPES[name].map((row, y) => (
                          <span className="shape-mini-row" key={`slot-${index}-${y}`}>
                            {row.map((cell, x) => <span className={cell ? 'filled' : ''} key={`slot-${index}-${y}-${x}`} />)}
                          </span>
                        ))}
                      </span>
                    ) : <span className="slot-empty">+</span>}
                  </button>
                );
              })}
            </div>
            <footer>
              <button type="button" onClick={closeQueueEditor}>Vazgec</button>
              <button type="button" className="primary-action" onClick={applyQueuePlan} disabled={plannedShapes.length !== queueSlotCount}>
                Uygula
              </button>
            </footer>
          </section>
        </div>
      )}

      {status === 'LEVEL_COMPLETE' && !showCompletionResult && (
        <div className="victory-celebration" role="status" aria-live="polite">
          <div className="victory-ring" aria-hidden="true" />
          <div className="victory-ring second" aria-hidden="true" />
          <span className="victory-kicker">Tahta tamamlandi</span>
          <strong>Bolum {level}</strong>
          <span className="victory-caption">Mukemmel!</span>
        </div>
      )}

      {((status === 'PAUSED' && !abilityMode && !queueEditorOpen) || (status === 'LEVEL_COMPLETE' && showCompletionResult) || status === 'GAME_OVER') && (
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
