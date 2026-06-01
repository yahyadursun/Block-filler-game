import React from 'react';
import { useGameStore } from '../store/useGameStore';
import { useSettingsStore } from '../store/useSettingsStore';
import '../styles/LevelSelect.css';

const ParkourLevelSelect: React.FC = () => {
  const { parkourLevels, setParkourLevel, setView } = useGameStore();
  const { language } = useSettingsStore();
  const isEnglish = language === 'en';

  const startLevel = (levelId: number) => {
    setParkourLevel(levelId);
    setView('PARKOUR');
  };

  return (
    <div className="level-select-container">
      <header className="level-header">
        <button type="button" className="back-btn" onClick={() => setView('MENU')}>
          {isEnglish ? 'Back' : 'Geri'}
        </button>
        <div>
          <span className="label">Bounzy Parkur</span>
          <h1>{isEnglish ? 'Parkour Levels' : 'Parkur Bolumu'}</h1>
        </div>
      </header>

      <div className="levels-grid">
        {parkourLevels.map((lvl) => (
          <button
            type="button"
            key={lvl.id}
            className={`level-card ${lvl.unlocked ? 'unlocked' : 'locked'}`}
            onClick={() => lvl.unlocked && startLevel(lvl.id)}
            disabled={!lvl.unlocked}
          >
            <span className="level-number">{lvl.id}</span>
            <span className="level-size">{lvl.targetBricks} {isEnglish ? 'targets' : 'hedef'}</span>
            <span className="level-size">{lvl.shotLimit} {isEnglish ? 'shots' : 'tur'}</span>
            <span className="level-size">{lvl.volleySize} {isEnglish ? 'balls' : 'top'}</span>
            <span className="level-size">{isEnglish ? 'Automatic layout' : 'Otomatik parkur'}</span>
            <span className="stars">{lvl.unlocked ? `${'*'.repeat(lvl.stars)}${'-'.repeat(5 - lvl.stars)}` : 'LOCK'}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ParkourLevelSelect;
