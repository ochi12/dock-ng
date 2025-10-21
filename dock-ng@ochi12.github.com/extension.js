/* extension.js
 * Copyright (C) 2025 ochi12
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
import {DockNGManager} from './src/dockManager.js';

export default class ShelledDesktopIconExtension extends Extension {
    enable() {
        this._manager = new DockNGManager(this);
    }

    disable() {
        if (this._manager) {
            this._manager.destroy();
            this._manager = null;
        }
    }
}
