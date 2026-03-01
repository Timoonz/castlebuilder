var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { zzfx } from "zzfx";
var SynthManager = /** @class */ (function () {
    function SynthManager() {
        this.sounds = new Map();
        this.globalVolume = 1.0;
        this.muted = false;
        this.soundConfigs = {
            blockDestruction: {
                params: [0, , 277, , .11, .05, 1, 1.6, 62.8, -0.1, 56, .03, .13, .5, 233, .2, .21, .77, .47, .29, 426],
                volume: 0.5,
            }
        };
        for (var _i = 0, _a = Object.entries(this.soundConfigs); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], config = _b[1];
            this.sounds.set(key, config);
        }
    }
    ;
    SynthManager.prototype.play = function (effect) {
        var _a;
        if (this.muted)
            return;
        var config = this.sounds.get(effect);
        if (!config)
            return;
        var adjustedParams = __spreadArray([], config.params, true);
        var effectVolume = (_a = config.volume) !== null && _a !== void 0 ? _a : 1.0;
        adjustedParams[0] = effectVolume * this.globalVolume;
        zzfx.apply(void 0, adjustedParams);
    };
    ;
    SynthManager.prototype.toggleMute = function () {
        this.muted = !this.muted;
        return this.muted;
    };
    ;
    SynthManager.prototype.isMuted = function () {
        return this.muted;
    };
    ;
    SynthManager.prototype.destroy = function () {
        this.sounds.clear();
    };
    ;
    return SynthManager;
}());
export { SynthManager };
//# sourceMappingURL=SynthManager.js.map