import { zzfx } from "zzfx";

export type SoundEffect =
    | "blockDestruction"

type ZzfxParams = (number | undefined)[];

interface SoundConfig {
    params: ZzfxParams
    volume?: number,
}

export class SynthManager {
    private sounds: Map<SoundEffect, SoundConfig> = new Map();
    private globalVolume: number = 1.0;
    private muted: boolean = false;

    private readonly soundConfigs: Record<SoundEffect, SoundConfig> = {
        blockDestruction: {
            params: [0, , 277, , .11, .05, 1, 1.6, 62.8, -0.1, 56, .03, .13, .5, 233, .2, .21, .77, .47, .29, 426],
            volume: 0.5,
        }
    };

    constructor() {
        for (const [key, config] of Object.entries(this.soundConfigs)) {
            this.sounds.set(key as SoundEffect, config);
        }
    };

    play(effect: SoundEffect): void {
        if (this.muted) return;

        const config = this.sounds.get(effect);
        if (!config) return;

        const adjustedParams = [...config.params];
        const effectVolume = config.volume ?? 1.0;
        adjustedParams[0] = effectVolume * this.globalVolume;

        zzfx(...adjustedParams);
    };

    toggleMute(): boolean {
        this.muted = !this.muted;
        return this.muted;
    };

    isMuted(): boolean {
        return this.muted;
    };

    destroy(): void {
        this.sounds.clear();
    };

}

