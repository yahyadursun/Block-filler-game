import React from 'react';
import { getLevelBoardDimensions, useGameStore } from '../store/useGameStore';
import '../styles/LevelSelect.css';

const LevelSelect: React.FC = () => {
  const { levels, setLevel, setView, resetGame } = useGameStore();

  const handleLevelClick = (levelId: number) => {
    setLevel(levelId);
    resetGame();
    setView('GAME');
  };

  return (
    <div className="level-select-container">
      <header className="level-header">
        <button type="button" className="back-btn" onClick={() => setView('MENU')}>
          Geri
        </button>
        <div>
          <span className="label">Block Filler</span>
          <h1>Bolum Sec</h1>
        </div>
      </header>

      <div className="levels-grid">
        {levels.map((lvl) => {
          const board = getLevelBoardDimensions(lvl);
          return (
            <button
              type="button"
              key={lvl.id}
              className={`level-card ${lvl.unlocked ? 'unlocked' : 'locked'}`}
              onClick={() => lvl.unlocked && handleLevelClick(lvl.id)}
              disabled={!lvl.unlocked}
            >
              <span className="level-number">{lvl.id}</span>
              <span className="level-size">{board.width}x{board.height}</span>
              <span className="level-size">{lvl.blockLimit} blok</span>
              {lvl.starterCells > 0 && <span className="level-size">{lvl.starterCells} hazir</span>}
              <span className="stars">{lvl.unlocked ? `${'*'.repeat(lvl.stars)}${'-'.repeat(5 - lvl.stars)}` : 'LOCK'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LevelSelect;
