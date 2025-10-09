/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {DockNGManager} from './dockManager.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class ShelledDesktopIconExtension extends Extension {
    constructor(metadata) {
        super(metadata);

        this._manager = null;
    }

    _addManager() {
        if (this._manager === null)
            this._manager = new DockNGManager(this);
    }

    _removeManager() {
        if (this._manager) {
            this._manager.destroy();
            this._manager = null;
        }
    }

    enable() {
        this._addManager();

        Main.layoutManager.connectObject('startup-complete', () => {
            Main.overview.hide();
        }, this);
    }

    disable() {
        this._removeManager();
    }
}
