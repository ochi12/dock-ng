import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DockNG, DockNGHotArea} from './dockNG.js';

const {signals: Signals} = imports;

const OverlapStatus = {
    UNDEFINED: -1,
    FALSE: 0,
    TRUE: 1,
};

class Intellihide {
    constructor(monitorIndex) {
        this._monitorIndex = monitorIndex;

        this._focusActor = null;
        this._focusActorId = false;

        this._status = OverlapStatus.UNDEFINED;
        this._targetBox = null;

        this._tracker = Shell.WindowTracker.get_default();


        this._onCheckOverlap();

        global.display.connectObject(
            'window-entered-monitor', this._onCheckOverlap.bind(this),
            'window-left-monitor', () => {
                this._onCheckOverlap.bind(this);
            },
            'restacked', this._onCheckOverlap.bind(this),
            'notify::focus-window', this._onCheckOverlap.bind(this),
            this);

        Main.layoutManager.connectObject(
            'monitors-changed', () => this._checkOverlapOnRemainingWindows(), this);

        this._tracker.connectObject(
            'notify::focus-app', this._onCheckOverlap.bind(this),
            this);
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
            this._status = OverlapStatus.FALSE;
            this.emit('status-changed');
            return;
        }

        const focusWin = focusApp.get_windows().find(w =>
            w.get_monitor() === this._monitorIndex &&
            w.showing_on_its_workspace() &&
            !w.minimized);

        if (!focusWin) {
            // If we move a focused window from [A] to [B]
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

        const winBox = focusWin.get_frame_rect();

        this._checkOverlap(winBox, this._targetBox);

        this._focusActor = focusWin.get_compositor_private();
        this._focusActorId = this._focusActor.connect('notify::allocation',
            () => {
                const newWinBox = focusWin.get_frame_rect();
                this._checkOverlap(newWinBox, this._targetBox);
            });
    }

    _checkOverlapOnRemainingWindows() {
        const windows = global.get_window_actors()
        .map(a => a.meta_window)
        .filter(w =>
            w &&                            // window exists
            w.get_monitor() === this._monitorIndex &&  // on this monitor
            !w.minimized &&                     // not minimized (optional)
            w.showing_on_its_workspace()        // visible on current workspace (important!)
        );

        windows.some(win => {
            const test = win && this._test(win.get_frame_rect(), this._targetBox);
            if (test) {
                this._checkOverlap(win.get_frame_rect(), this._targetBox);
                return true;
            }
            return false;
        });
    }

    _checkOverlap(winBox, targetBox) {
        const overlap = this._test(winBox, targetBox);

        const oldStatus = this._status;
        if (overlap)
            this._status = OverlapStatus.TRUE;
        else
            this._status = OverlapStatus.FALSE;

        if (oldStatus !== this._status)
            this.emit('status-changed');
    }

    _test(winBox, targetBox) {
        return !(winBox.x + winBox.width < targetBox.x ||
                 targetBox.x + targetBox.width < winBox.x ||
                 winBox.y + winBox.height < targetBox.y ||
                 targetBox.y + targetBox.height < winBox.y);
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

                this._trackedDocks.set(i, {dockNG, dockNGId, intellihide, intellihideId, hotArea});

                Main.layoutManager.hotCorners.push(hotArea);
            } else {
                Main.layoutManager.hotCorners.push(null);
            }
        }
    }

    _clearDocks() {
        for (const dock of this._trackedDocks.values()) {
            const {dockNG, dockNGId, intellihide, intellihideId, hotArea} = dock;
            if (dockNG) {
                dockNG.disconnect(dockNGId);
                dockNG.destroy();
            }
            if (intellihide) {
                intellihide.disconnect(intellihideId);
                intellihide.destroy();
            }

            if (hotArea) {
                hotArea.disconnectObject(this);
                hotArea.destroy();
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
