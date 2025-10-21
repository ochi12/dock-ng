import GLib from 'gi://GLib';

const Type = {
    AN: 'an',
    B: 'b',
};

const {signals: Signals} = imports;

export const KeysType = {
    'background-color': Type.AN,
    'custom-appearance-enabled': Type.B,
    'custom-color-enabled': Type.B,
};

export class SettingsManager {
    constructor(settings) {
        this._settings = settings;
        this._signalKeys = [];

        Object.keys(KeysType).forEach(key => {
            const settingType = KeysType[key];
            const settingKey = key;
            const propName = key.replaceAll('-', '_');

            switch (settingType) {
            case Type.AN:
                Object.defineProperty(this, propName, {
                    get() {
                        return this._settings.get_value(settingKey).deep_unpack();
                    },
                    set(v) {
                        this._settings.set_value(settingKey, new GLib.Variant(Type.AN, v));
                    },
                });

                break;
            case Type.B:
                Object.defineProperty(this, propName, {
                    get() {
                        return this._settings.get_boolean(settingKey);
                    },
                    set(v) {
                        this._settings.set_boolean(settingKey, v);
                    },
                });

                break;
            }

            const sig = this._settings.connect(`changed::${settingKey}`, () => {
                this.emit(`changed::${settingKey}`);
            });

            this._signalKeys.push(sig);
        });
    }

    destroy() {
        if (this._settings) {
            this._signalKeys.forEach(key => {
                this._settings.disconnect(key);
            });
            this._settings = null;
        }

        this._signalKeys = [];
    }

    get signalKeys() {
        return this._signalKeys;
    }
}

Signals.addSignalMethods(SettingsManager.prototype);
