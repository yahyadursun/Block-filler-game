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

    public playError() {
        this.playTone(150, 0.3, 'sawtooth', 0.1);
    }

    public playBrickHit() {
        this.playTone(520, 0.045, 'square', 0.045);
    }

    public playBrickBreak() {
        this.playTone(720, 0.06, 'triangle', 0.08);
        setTimeout(() => this.playTone(360, 0.1, 'square', 0.05), 35);
    }

    public playShieldHit() {
        this.playTone(880, 0.07, 'triangle', 0.08);
        setTimeout(() => this.playTone(420, 0.12, 'sawtooth', 0.05), 35);
    }

    public playShieldBreak() {
        this.playTone(1200, 0.08, 'square', 0.09);
        setTimeout(() => this.playTone(760, 0.12, 'triangle', 0.08), 45);
        setTimeout(() => this.playTone(260, 0.18, 'sawtooth', 0.06), 95);
    }
}

export const soundManager = new SoundManager();
