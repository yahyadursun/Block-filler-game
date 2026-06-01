import { create } from 'zustand';
import { soundManager } from '../utils/SoundManager';

export type Language = 'tr' | 'en';

interface SettingsState {
  language: Language;
  sfxEnabled: boolean;
  sfxVolume: number;
  vibrationEnabled: boolean;
  setLanguage: (language: Language) => void;
  setSfxEnabled: (enabled: boolean) => void;
  setSfxVolume: (volume: number) => void;
  setVibrationEnabled: (enabled: boolean) => void;
}

const initialSfxEnabled = localStorage.getItem('block-filler-sfx-enabled') !== 'false';
const initialSfxVolume = Number(localStorage.getItem('block-filler-sfx-volume') || 0.7);

soundManager.configure(initialSfxEnabled, initialSfxVolume);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  language: localStorage.getItem('block-filler-language') === 'en' ? 'en' : 'tr',
  sfxEnabled: initialSfxEnabled,
  sfxVolume: initialSfxVolume,
  vibrationEnabled: localStorage.getItem('block-filler-vibration-enabled') !== 'false',
  setLanguage: (language) => {
    localStorage.setItem('block-filler-language', language);
    set({ language });
  },
  setSfxEnabled: (sfxEnabled) => {
    localStorage.setItem('block-filler-sfx-enabled', String(sfxEnabled));
    soundManager.configure(sfxEnabled, get().sfxVolume);
    set({ sfxEnabled });
  },
  setSfxVolume: (sfxVolume) => {
    const volume = Math.max(0, Math.min(1, sfxVolume));
    localStorage.setItem('block-filler-sfx-volume', String(volume));
    soundManager.configure(get().sfxEnabled, volume);
    set({ sfxVolume: volume });
  },
  setVibrationEnabled: (vibrationEnabled) => {
    localStorage.setItem('block-filler-vibration-enabled', String(vibrationEnabled));
    set({ vibrationEnabled });
  },
}));
