import React from 'react';
import { useGameStore } from '../store/useGameStore';
import '../styles/MainMenu.css';

const MainMenu: React.FC = () => {
  const { setView, bestScore } = useGameStore();

  return (
    <main className="main-menu">
      <section className="menu-shell">
        <div className="game-logo">
          <span className="label">Arcade puzzle</span>
          <h1>Block Filler</h1>
          <p>Duseni yonet, bosluklari doldur, satir ve sutunlari temizle.</p>
        </div>

        <div className="menu-buttons">
          <button className="cyber-btn primary" type="button" onClick={() => setView('LEVEL_SELECT')}>
            Oyuna Basla
          </button>
          <button className="cyber-btn" type="button" onClick={() => setView('LEVEL_SELECT')}>
            Bolumler
          </button>
          <button className="cyber-btn" type="button" onClick={() => setView('PARKOUR_SELECT')}>
            Parkur Modu
          </button>
        </div>

        <div className="menu-stats">
          <span className="label">Rekor</span>
          <strong>{bestScore}</strong>
        </div>
      </section>
    </main>
  );
};

export default MainMenu;
