import React, { useState } from 'react';
import SettingsPanel from './SettingsPanel';
import { useGameStore } from '../store/useGameStore';
import { useSettingsStore } from '../store/useSettingsStore';
import '../styles/MainMenu.css';

const MainMenu: React.FC = () => {
  const { setView, bestScore } = useGameStore();
  const { language } = useSettingsStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isEnglish = language === 'en';

  return (
    <main className="main-menu">
      <section className="menu-shell">
        <div className="game-logo">
          <span className="label">{isEnglish ? 'Arcade puzzle' : 'Arcade bulmaca'}</span>
          <h1>Block Filler</h1>
          <p>{isEnglish ? 'Guide falling pieces, fill gaps, and complete rows and columns.' : 'Duseni yonet, bosluklari doldur, satir ve sutunlari tamamla.'}</p>
        </div>

        <div className="menu-buttons">
          <button className="cyber-btn primary" type="button" onClick={() => setView('LEVEL_SELECT')}>
            {isEnglish ? 'Play' : 'Oyuna Basla'}
          </button>
          <button className="cyber-btn" type="button" onClick={() => setView('LEVEL_SELECT')}>
            {isEnglish ? 'Levels' : 'Bolumler'}
          </button>
          <button className="cyber-btn" type="button" onClick={() => setView('PARKOUR_SELECT')}>
            {isEnglish ? 'Parkour Mode' : 'Parkur Modu'}
          </button>
          <button className="cyber-btn" type="button" onClick={() => setSettingsOpen(true)}>
            {isEnglish ? 'Settings' : 'Ayarlar'}
          </button>
        </div>

        <div className="menu-stats">
          <span className="label">{isEnglish ? 'Best score' : 'Rekor'}</span>
          <strong>{bestScore}</strong>
        </div>
      </section>
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </main>
  );
};

export default MainMenu;
