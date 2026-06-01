class SoundManager {
    private ctx: AudioContext | null = null;

    private init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
    }

    private playTone(freq: number, duration: number, type: OscillatorType = 'square', volume: number = 0.1) {
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    public playMove() {
        this.playTone(440, 0.05, 'square', 0.05);
    }

    public playRotate() {
        this.playTone(660, 0.1, 'sawtooth', 0.05);
    }

    public playSettle() {
        this.playTone(110, 0.2, 'triangle', 0.2);
        // İkinci bir düşük frekans ekle (tok ses için)
        setTimeout(() => this.playTone(55, 0.3, 'sine', 0.1), 50);
    }

    public playLevelUp() {
        [261, 329, 392, 523].forEach((f, i) => {
            setTimeout(() => this.playTone(f, 0.2, 'square', 0.1), i * 100);
        });
    }

    public playLineComplete(lines = 1) {
        const notes = lines > 1 ? [440, 660, 880, 1100] : [440, 660, 880];
        notes.forEach((freq, index) => {
            setTimeout(() => this.playTone(freq, 0.12, index === notes.length - 1 ? 'triangle' : 'square', 0.075), index * 48);
        });
        if (lines > 1) {
            setTimeout(() => this.playTone(1320, 0.18, 'triangle', 0.085), 190);
        }
    }

    public playError() {
        this.playTone(150, 0.3, 'sawtooth', 0.1);
    }

    public playBomb() {
        this.playTone(180, 0.16, 'sawtooth', 0.12);
        setTimeout(() => this.playTone(90, 0.28, 'square', 0.11), 35);
        setTimeout(() => this.playTone(48, 0.38, 'sine', 0.12), 70);
    }

    public playLineClearPower() {
        this.playTone(920, 0.08, 'sawtooth', 0.08);
        setTimeout(() => this.playTone(520, 0.16, 'triangle', 0.075), 48);
    }

    public playBrickHit() {
        this.playTone(520, 0.045, 'square', 0.045);
    }

    public playBrickBreak() {
        this.playTone(720, 0.06, 'triangle', 0.08);
        setTimeout(() => this.playTone(360, 0.1, 'square', 0.05), 35);
    }

}

export const soundManager = new SoundManager();
