import React from 'react';
import { useSettingsStore } from '../store/useSettingsStore';
import '../styles/SettingsPanel.css';

interface SettingsPanelProps {
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const {
    language,
    sfxEnabled,
    sfxVolume,
    vibrationEnabled,
    setLanguage,
    setSfxEnabled,
    setSfxVolume,
    setVibrationEnabled,
  } = useSettingsStore();
  const isEnglish = language === 'en';

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-label={isEnglish ? 'Settings' : 'Ayarlar'}>
      <section className="settings-panel">
        <header>
          <div>
            <span className="label">Block Filler</span>
            <h2>{isEnglish ? 'Settings' : 'Ayarlar'}</h2>
          </div>
          <button type="button" className="settings-close" onClick={onClose} aria-label={isEnglish ? 'Close' : 'Kapat'}>
            X
          </button>
        </header>

        <div className="settings-row">
          <div>
            <strong>{isEnglish ? 'Language' : 'Dil'}</strong>
            <span>{isEnglish ? 'Interface language' : 'Arayuz dili'}</span>
          </div>
          <div className="settings-segments" role="group" aria-label={isEnglish ? 'Language' : 'Dil'}>
            <button type="button" className={language === 'tr' ? 'active' : ''} onClick={() => setLanguage('tr')}>TR</button>
            <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
          </div>
        </div>

        <label className="settings-row">
          <div>
            <strong>{isEnglish ? 'Sound effects' : 'Ses efektleri'}</strong>
            <span>{isEnglish ? 'Movement and impact sounds' : 'Hareket ve carpma sesleri'}</span>
          </div>
          <input type="checkbox" checked={sfxEnabled} onChange={(event) => setSfxEnabled(event.target.checked)} />
        </label>

        <label className="settings-row settings-slider">
          <div>
            <strong>{isEnglish ? 'Effects volume' : 'Efekt seviyesi'}</strong>
            <span>{Math.round(sfxVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={sfxVolume}
            disabled={!sfxEnabled}
            onChange={(event) => setSfxVolume(Number(event.target.value))}
          />
        </label>

        <label className="settings-row">
          <div>
            <strong>{isEnglish ? 'Vibration' : 'Titresim'}</strong>
            <span>{isEnglish ? 'Touch feedback on supported devices' : 'Desteklenen cihazlarda dokunus geri bildirimi'}</span>
          </div>
          <input type="checkbox" checked={vibrationEnabled} onChange={(event) => setVibrationEnabled(event.target.checked)} />
        </label>

        <footer>
          <button type="button" className="primary-action" onClick={onClose}>
            {isEnglish ? 'Done' : 'Tamam'}
          </button>
        </footer>
      </section>
    </div>
  );
};

export default SettingsPanel;
