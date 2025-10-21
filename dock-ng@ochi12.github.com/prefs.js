import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {SettingsManager} from './src/helpers/settingsManager.js';

const PrefsPage = GObject.registerClass({
    GTypeName: 'PrefsPage',
    Template: GLib.uri_resolve_relative(import.meta.url, './resources/ui/prefs.ui', GLib.UriFlags.NONE),
    InternalChildren: [
        'appearance_group',
        'appearance_switch',
        'color_row',
        'color_dialog',
        'color_button',
        'color_switch',
        'opacity_row',
        'opacity_slider',
        'opacity_adjustment',
    ],
}, class PrefsPage extends Adw.PreferencesPage {
    _init(settings) {
        super._init();
        this._settings = settings;

        this._settingsManager = new SettingsManager(this._settings);

        this._color_switch.active = this._settingsManager.custom_color_enabled;
        this._appearance_switch.active = this._settingsManager.custom_appearance_enabled;

        this._color_row.sensitive = this._appearance_switch.active;
        this._opacity_row.sensitive = this._appearance_switch.active;

        const colorArr = this._settingsManager.background_color;
        const rgba = new Gdk.RGBA();
        rgba.red = colorArr[0] / 255;
        rgba.green = colorArr[1] / 255;
        rgba.blue = colorArr[2] / 255;
        rgba.alpha = colorArr[3] / 255;

        this._opacity_adjustment.value = colorArr[3];
        this._color_button.set_rgba(rgba);
        this._color_button.sensitive = this._color_switch.active;
    }

    _onAppearanceSwitchToggled(sw) {
        this._color_row.sensitive = sw.active;
        this._opacity_row.sensitive = sw.active;
        this._settingsManager.custom_appearance_enabled = sw.active;
    }

    _onColorChanged(colorButton) {
        const newRGBA = colorButton.rgba;
        newRGBA.alpha = this._opacity_adjustment.value / 255.0;
        this._settingsManager.background_color = [
            Math.round(newRGBA.red * 255),
            Math.round(newRGBA.green * 255),
            Math.round(newRGBA.blue * 255),
            this._opacity_adjustment.value,
        ];

        // avoid recursion
        if (Math.round(newRGBA.alpha * 255) !== this._opacity_adjustment.value)
            this._color_button.set_rgba(newRGBA);
    }

    _onColorSwitchToggled(sw) {
        this._color_button.sensitive = sw.active;
        this._settingsManager.custom_color_enabled = sw.active;
    }

    _onOpacityChanged() {
        this._onColorChanged(this._color_button);
    }

    destroy() {
        if (this._settingsManager) {
            this._settingsManager.destroy();
            this._settingsManager = null;
            this._settings = null;
        }
    }
});

export default class DockNGPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._settings = this.getSettings('org.gnome.shell.extensions.dock-ng');
        window.add(new PrefsPage(window._settings));
    }
}
