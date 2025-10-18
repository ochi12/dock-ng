/* dockManager.js
 *
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
 *
 * -------------------------------------------------------------------------
 * Inspiration Acknowledgement:
 *
 * The initial idea and base concept for the intellihide feature
 * “dash-to-dock” project by micheleg:
 *      https://github.com/micheleg/dash-to-dock
 *
 * -------------------------------------------------------------------------
 */

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DockNG, DockNGHotArea} from './dockNG.js';

const {signals: Signals} = imports;

const OverlapStatus = {
    UNDEFINED: -1,
    FALSE: 0,
    TRUE: 1,
};

// List of windows type taken into account.
// Order is important (keep the original enum order).
const handledWindowTypes = [
    Meta.WindowType.NORMAL,
    Meta.WindowType.DOCK,
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
    Meta.WindowType.TOOLBAR,
    Meta.WindowType.MENU,
    Meta.WindowType.UTILITY,
    Meta.WindowType.SPLASHSCREEN,
];


class Intellihide {
    constructor(monitorIndex) {
        this._monitorIndex = monitorIndex;

        this._focusActor = null;
        this._focusActorId = false;

        this._status = OverlapStatus.UNDEFINED;
        this._targetBox = null;

        this._tracker = Shell.WindowTracker.get_default();

        global.display.connectObject(
            'window-entered-monitor', this._onCheckOverlap.bind(this),
            'window-left-monitor', this._onCheckOverlap.bind(this),
            'restacked', this._onCheckOverlap.bind(this),
            'notify::focus-window', this._onCheckOverlap.bind(this),
            this);

        Main.layoutManager.connectObject(
            'monitors-changed', this._onCheckOverlap.bind(this), this);

        this._tracker.connectObject(
            'notify::focus-app', this._onCheckOverlap.bind(this),
            this);

        Main.keyboard.connectObject('visibility-changed',
            this._onKeyboardVisibilityChanged.bind(this), this);
    }

    _onCheckOverlap() {
        if (this._focusActor && this._focusActorId) {
            this._focusActor.disconnect(this._focusActorId);
            this._focusActorId = 0;
            this._focusActor = null;
        }

        if (!this._targetBox)
            return;

        const focusApp = this._tracker.focus_app;
        if (!focusApp) {
            // no focus app might register
            // e.g. after lock screen or no apps opened
            this._checkOverlapOnRemainingWindows();
            return;
        }

        let focusWin = focusApp.get_windows().find(w =>
            w.get_monitor() === this._monitorIndex &&
            w.showing_on_its_workspace() &&
            !w.minimized &&
            this._isHandledWindow(w));

        // in the primary monitor, focus win might not exist in the current workspace
        if (focusWin && this._monitorIndex === Main.layoutManager.primaryIndex) {
            if (focusWin.get_workspace() !== global.workspace_manager.get_active_workspace())
                focusWin = null;
        }

        if (!focusWin) {
            // If we move a focused window from monitor [A] to [B]
            // we get a null focusWin  because we filtered focusWin for [A]
            // for current monitor only.
            // If some or all other windows in  [A]
            // overlaps the dock, we need to try to hide the dock
            // since focus window is not per display.
            //
            // e.g. if you have a window on each monitor,
            // [A] has youtube and [B] has a random app
            // without this guard, if you switch between windows, the dock
            // would try to show up since it thinks there is not focus window
            // on current display
            this._checkOverlapOnRemainingWindows();
            return;
        }

        const overlap = (winBox, targetBox) => this._test(winBox, targetBox);

        const winBox = focusWin.get_frame_rect();
        this._applyOverlapStatus(overlap(winBox, this._targetBox), true);

        this._focusActor = focusWin.get_compositor_private();
        this._focusActorId = this._focusActor.connect('notify::allocation',
            () => {
                const newWinBox = focusWin.get_frame_rect();
                this._applyOverlapStatus(overlap(newWinBox, this._targetBox));
            });
    }

    _checkOverlapOnRemainingWindows() {
        let windows = global.get_window_actors()
        .map(a => a.meta_window)
        .filter(w =>
            w &&
            w.get_monitor() === this._monitorIndex &&
            !w.minimized &&
            w.showing_on_its_workspace() &&
            this._isHandledWindow(w)
        );

        // in the primary monitor, other windows might be present in other workspace
        // we need filter those
        if (this._monitorIndex === Main.layoutManager.primaryIndex) {
            windows = windows.filter(w =>
                w.get_workspace() === global.workspace_manager.get_active_workspace());
        }

        if (windows.length === 0)
            this._applyOverlapStatus(false, true);

        const overlap = windows.some(win =>
            win && this._test(win.get_frame_rect(), this._targetBox));

        this._applyOverlapStatus(overlap);
    }

    _applyOverlapStatus(overlap, forceApply = false) {
        // forceApply: sometimes we need to spam 'status-changed'

        const oldStatus = this._status;
        const newStatus = overlap ? OverlapStatus.TRUE : OverlapStatus.FALSE;

        if (!forceApply && oldStatus === newStatus)
            return;

        this._status = newStatus;
        this.emit('status-changed');
    }

    _isHandledWindow(win) {
        // FIXME: We need to specific window types
        // not all handledWindowTypes are always valid
        // somethimes we need to ignore specific one.

        return handledWindowTypes.includes(win.get_window_type());
    }

    _test(winBox, targetBox) {
        return !(winBox.x + winBox.width < targetBox.x ||
                 targetBox.x + targetBox.width < winBox.x ||
                 winBox.y + winBox.height < targetBox.y ||
                 targetBox.y + targetBox.height < winBox.y);
    }

    _onKeyboardVisibilityChanged() {
        if (Main.keyboard.visible) {
            this._applyOverlapStatus(true, true);
        } else {
            this._applyOverlapStatus(false, true);
            this._onCheckOverlap();
        }
    }

    get status() {
        return this._status;
    }

    updateTargetBox(box) {
        this._targetBox = box;
        this._onCheckOverlap();
    }

    destroy() {
        this._tracker.disconnectObject(this);
        global.display.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        Main.keyboard.disconnectObject(this);

        if (this._focusActor && this._focusActorId) {
            this._focusActor.disconnect(this._focusActorId);
            this._focusActorId = 0;
            this._focusActor = null;
        }
    }
}
Signals.addSignalMethods(Intellihide.prototype);

export class DockNGManager {
    constructor(_extension) {
        /* We well support multimitor support later on*/
        this._trackedDocks = new Map();

        Main.layoutManager.connectObject('hot-corners-changed', () => this._updateHotArea(), this);
        Main.layoutManager._updateHotCorners();

        this._destroy = false;
    }

    _updateHotArea() {
        if (this._destroy)
            return;
        /* Remember:
         * There are many ways to setup multimitor.
         * if monitors are setup horizontally then we have a defined bottom
         * if monitors are setup vertically then the defined bottom is bottom most monitor
         * e.g.
         * [Monitor 0]
         * [Monitor 1]
         * -> in this setup, monitors are stacked vertically Monitor 1 must be the one to receive
         *    a hot edge.
         * e.g.
         * [Monitor 0] [Monitor 1]
         * [Monitor 2]
         * -> in this setup, Monitor would be considered bottomless and only monitor 2 and 1 have
         *    defined bottom.
         */
        this._clearDocks();
        for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
            const monitor = Main.layoutManager.monitors[i];

            const bottom = monitor.y + monitor.height;
            const left = monitor.x;
            const right = monitor.x + monitor.width;
            const barrierSize = monitor.width;

            const hasNoBottom = Main.layoutManager.monitors.some((otherMonitor, j) => {
                return i !== j &&
                       otherMonitor.y >= bottom &&
                       otherMonitor.x < right &&
                       otherMonitor.x + otherMonitor.width > left;
            });

            if (!hasNoBottom) {
                const dockNG = new DockNG(i);
                const intellihide = new Intellihide(i);

                /* this is necessary or else intellihide will not
                 * recover immediately after lock screen.
                 * this works because targetBox is already calculated
                 * by dockNG on init.
                 */
                intellihide.updateTargetBox(dockNG.targetBox);

                const dockNGId = dockNG.connect('target-box-updated', () => {
                    intellihide.updateTargetBox(dockNG.targetBox);
                });

                const intellihideId = intellihide.connect('status-changed', () => {
                    if (intellihide.status === OverlapStatus.FALSE)
                        dockNG.blockAutoHide(true);
                    else if (intellihide.status === OverlapStatus.TRUE)
                        dockNG.blockAutoHide(false);
                });

                const hotArea = new DockNGHotArea(Main.layoutManager, monitor, left, bottom);
                hotArea.connectObject('triggered',  () => dockNG.showDock(true), this);
                hotArea.setBarrierSize(barrierSize);

                this._trackedDocks.set(i, {dockNG, dockNGId, intellihide, intellihideId});

                Main.layoutManager.hotCorners.push(hotArea);
            } else {
                Main.layoutManager.hotCorners.push(null);
            }
        }
    }

    _clearDocks() {
        for (const dock of this._trackedDocks.values()) {
            const {dockNG, dockNGId, intellihide, intellihideId} = dock;
            if (dockNG) {
                dockNG.disconnect(dockNGId);
                dockNG.destroy();
            }
            if (intellihide) {
                intellihide.disconnect(intellihideId);
                intellihide.destroy();
            }
        }

        this._trackedDocks.clear();
    }

    destroy() {
        this._clearDocks();
        this._destroy = true;
        Main.layoutManager.disconnectObject(this);
        Main.layoutManager._updateHotCorners();
    }
}
