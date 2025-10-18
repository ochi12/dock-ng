/* dockNg.js
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
 * The initial idea and base concept for this extension were inspired by the
 * “dock-from-dash” project by fthx:
 *     https://github.com/fthx/dock-from-dash
 *
 * While DockNG has since diverged significantly in architecture,
 * behavior, and implementation, the early concepts from dock-from-dash
 * influenced the beginning of this project, and credit is given in
 * accordance with good open-source practice.
 * -------------------------------------------------------------------------
 */


import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';

import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';

const DOCK_MAX_HEIGHT_RATIO = 0.16;
const DOCK_AUTOHIDE_TIMEOUT = 500; // ms

const DOCK_ANIMATION_TIME = 200; // DASH_ANIMATION_TIME = 200;
const DOCK_VISIBILITY_ANIMATION_TIME = 200;
const DOCK_HIDE_SCALE = 0.98;

const HOT_AREA_TRIGGER_SPEED = 150; // dash to dock has too much pressure treshold
const HOT_AREA_TRIGGER_TIMEOUT = 550; // prevent spam. A little bit more than DOCK_AUTOHIDE_TIMEOUT

// This class is base on Layout.HotCorner
export const DockNGHotArea = GObject.registerClass({
    Signals: {
        'triggered': {},
    },
}, class DockNGHotArea extends Clutter.Actor {
    _init(layoutManager, monitor, left, bottom) {
        super._init();

        this._entered = false;
        this._monitor = monitor;
        this._left = left;
        this._bottom = bottom;

        this._horizontalBarrier = null;

        this._pressureBarrier = new Layout.PressureBarrier(
            HOT_AREA_TRIGGER_SPEED,
            HOT_AREA_TRIGGER_TIMEOUT,
            Shell.ActionMode.NORMAL
        );
        this._pressureBarrier.connectObject('trigger', this._toggle.bind(this), this);


        // this will not emit 'trigger' window is currently dragged
        this._triggerAllowed = true;
        global.display.connectObject(
            'grab-op-begin', this._onGrabBegin.bind(this),
            'grab-op-end', this._onGrabEnd.bind(this),
            this);
    }

    setBarrierSize(size) {
        if (this._horizontalBarrier) {
            this._pressureBarrier.removeBarrier(this._horizontalBarrier);
            this._horizontalBarrier.destroy();
            this._horizontalBarrier = null;
        }

        if (size === 0)
            return;

        this._horizontalBarrier = new Meta.Barrier({
            backend: global.backend,
            x1: this._left, x2: this._left + this._monitor.width,
            y1: this._bottom, y2: this._bottom,
            directions: Meta.BarrierDirection.NEGATIVE_Y,
        });

        this._pressureBarrier.addBarrier(this._horizontalBarrier);
    }

    _onGrabBegin(display, window, op) {
        if (op === Meta.GrabOp.MOVING)
            this._triggerAllowed = false;
    }

    _onGrabEnd(display, window, op) {
        if (op === Meta.GrabOp.MOVING)
            this._triggerAllowed = true;
    }

    _toggle() {
        if (this._triggerAllowed)
            this.emit('triggered');
    }

    destroy() {
        global.display.disconnectObject(this);

        this.setBarrierSize(0);

        if (this._pressureBarrier) {
            this._pressureBarrier.disconnectObject(this);
            this._pressureBarrier.destroy();
            this._pressureBarrier = null;
        }

        super.destroy();
    }
});


export const DockNG = GObject.registerClass({
    Signals: {
        'target-box-updated': {},
    },
}, class DockNG extends Dash.Dash {
    _init(monitorIndex) {
        super._init();

        this._addChrome();

        this._monitorIndex = monitorIndex;

        this._workArea = null;
        this._autohideTimeoutId = 0;
        this._delayUpdateDockAreaId = 0;
        this._menuOpened = false;
        this._targetBox = null;

        this._blockAutoHide = false;

        // let actual dash handle toggle mode
        // since the only purpose of dock!ng's showAppsButton is to open app grid
        this.showAppsButton.set_toggle_mode(false);
        this.showAppsButton.connectObject('clicked', () => Main.overview.showApps(), this);

        global.display.connectObject(
            'workareas-changed', this._updateDockArea.bind(this), this);

        Main.layoutManager.connectObject(
            'monitors-changed', this._updateDockArea.bind(this), this);

        Main.overview.connectObject(
            'shown', () => {
                this.showDock(false, this._monitorIndex !== Main.layoutManager.primaryIndex);
            },
            'hidden', () => {
                if (this._blockAutoHide)
                    this.showDock(true);
            },
            'hiding', () => {
                this.showDock(false, false);
            },
            'item-drag-begin', () => {
                this._draggingItem = true;
                this._onHover();
            },
            'item-drag-end', () => {
                this._draggingItem = false;
                this._onHover();
            }, this);

        this._dashContainer.set_track_hover(true);
        this._dashContainer.set_reactive(true);
        this._dashContainer.connectObject('notify::hover',
            this._onHover.bind(this), this);

        this._updateDockArea();
    }

    // override original _redisplay
    _redisplay() {
        const oldIconSize = this.iconSize;
        super._redisplay();

        if (this.iconSize !== oldIconSize)
            this._reposition(oldIconSize, this.iconSize);
    }

    _reposition(oldIconSize, newIconSize) {
        if (!this._workArea)
            return;

        if (Main.overview.visible)
            return;

        let iconChildren = this._box.get_children().filter(actor => {
            return actor.child &&
                   actor.child._delegate &&
                   actor.child._delegate.icon &&
                   !actor.animatingOut;
        });

        if (this._showAppsIcon)
            iconChildren.push(this._showAppsIcon);

        const scale = oldIconSize / newIconSize;

        for (let i = 0; i < iconChildren.length; i++) {
            let icon = iconChildren[i].child._delegate.icon;

            // Set the new size immediately, to keep the icons' sizes
            // in sync with this.iconSize
            icon.setIconSize(this.iconSize);

            let [targetWidth, targetHeight] = icon.icon.get_size();

            // Scale the icon's texture to the previous size and
            // tween to the new size
            icon.icon.set_size(
                icon.icon.width * scale,
                icon.icon.height * scale);

            // We only allow updating target box once dock
            // reaches final size. So we set _updateDockArea param
            // to false. Hover behavior is heavily affected when
            // target box is updated frequently. This problem originated
            // from Issue: https://github.com/ochi12/dock-ng/issues/16
            const heightId = icon.icon.connect('notify::allocation',
                () => this._updateDockArea(false));

            icon.icon.ease({
                width: targetWidth,
                height: targetHeight,
                duration: DOCK_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    icon.icon.disconnect(heightId);
                    // Delay target box calculation.
                    // Since target box is updated, users might
                    // not have the chance to cancel hide through hover if
                    // there is a current overlap since blockAutoHide will
                    // do an immediate dock hide.
                    if (this._delayUpdateDockAreaId)
                        GLib.source_remove(this._delayUpdateDockAreaId);

                    this._delayUpdateDockAreaId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
                        DOCK_VISIBILITY_ANIMATION_TIME, () => {
                            this._updateDockArea();
                            this._delayUpdateDockAreaId = 0;
                            return GLib.SOURCE_REMOVE;
                        });
                },
            });
        }

        if (this._separator) {
            this._separator.ease({
                height: this.iconSize,
                duration: DOCK_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }

    _queueRedisplay() {
        if (this._workId)
            Main.queueDeferredWork(this._workId);
    }

    _addChrome() {
        Main.layoutManager.addTopChrome(this);
    }

    _untrackChrome() {
        Main.layoutManager.untrackChrome(this);
    }

    _updateDockArea(computeTargetBox = true) {
        this._workArea = Main.layoutManager.getWorkAreaForMonitor(this._monitorIndex);
        if (!this._workArea)
            return;

        const maxDockHeight = Math.round(this._workArea.height * DOCK_MAX_HEIGHT_RATIO);

        this.setMaxSize(this._workArea.width, maxDockHeight);
        this.set_width(this._workArea.width);
        this.set_height(Math.min(maxDockHeight,
            this.get_preferred_height(this.width)));

        const targetY = this._workArea.y + this._workArea.height - this.height;

        if (computeTargetBox)
            this._computeTargetBox(targetY);

        if (this.is_visible())
            this.set_position(this._workArea.x, targetY);
        else
            this.set_position(this._workArea.x, targetY + this.height);
    }

    _computeTargetBox(targetY) {
        // y constaints are the only important parseInt
        // but we will just include it anyways. could be part of settings?
        const x = this._workArea.x;
        const width = this._workArea.x + this._workArea.width;

        const y = targetY;
        const height = this.height;

        this._targetBox = {x, y, width, height};
        this.emit('target-box-updated');
    }

    // override original _itemMenuStateChanged
    _itemMenuStateChanged(item, opened) {
        super._itemMenuStateChanged(item, opened);
        this._menuOpened = opened;
        this._onHover();
    }

    _onHover() {
        if (this._autohideTimeoutId)
            GLib.source_remove(this._autohideTimeoutId);


        this._autohideTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            DOCK_AUTOHIDE_TIMEOUT,
            () => {
                if (this._dashContainer.get_hover())
                    return GLib.SOURCE_CONTINUE;
                if (this._draggingItem)
                    return GLib.SOURCE_CONTINUE;
                if (this._menuOpened)
                    return GLib.SOURCE_CONTINUE;
                if (this._blockAutoHide)
                    return GLib.SOURCE_CONTINUE;

                this.showDock(false, true);
                this._autohideTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            });
    }

    blockAutoHide(block) {
        this._blockAutoHide = block;
        if (!this._dashContainer.get_hover())
            this.showDock(block && !Main.overview.visible);
        else
            this.showDock(!Main.overview.visible);

        this._onHover();
    }

    get targetBox() {
        return this._targetBox;
    }

    showDock(show, animate = true) {
        if (!this._workArea)
            return;

        if (show)
            this.show();

        const hideY = this._workArea.y + this._workArea.height;
        const showY = hideY - this.height;

        this.set_pivot_point(0.5, 1);

        this.ease({
            scale_x: show ? 1 : DOCK_HIDE_SCALE,
            scale_y: show ? 1 : DOCK_HIDE_SCALE,
            opacity: show ? 255 : 0,
            duration: animate ? DOCK_VISIBILITY_ANIMATION_TIME * (show ? 1 : 0.8) : 0,
            mode: show ? Clutter.AnimationMode.EASE_IN_CUBIC
                : Clutter.AnimationMode.EASE_OUT_CUBIC,
            onComplete: () => {
                if (!show) {
                    this.hide();
                    this.opacity = 0;
                    this.set_scale(DOCK_HIDE_SCALE, DOCK_HIDE_SCALE);
                }
            },
        });

        this.ease({
            y: show ? showY : hideY,
            duration: animate ? DOCK_VISIBILITY_ANIMATION_TIME * (show ? 0.8 : 1) : 0,
            mode: Clutter.AnimationMode.LINEAR,
        });
    }

    destroy() {
        if (this._autohideTimeoutId > 0) {
            GLib.source_remove(this._autohideTimeoutId);
            this._autohideTimeoutId = 0;
        }

        if (this._delayUpdateDockAreaId > 0) {
            GLib.source_remove(this._delayUpdateDockAreaId);
            this._delayUpdateDockAreaId = 0;
        }

        this.showAppsButton.disconnectObject(this);

        this.disconnectObject(this);

        global.display.disconnectObject(this);

        Main.overview.disconnectObject(this);

        this._dashContainer.disconnectObject(this);

        Main.layoutManager.disconnectObject(this);

        this._untrackChrome();

        this._workId = null;

        super.destroy();
    }
});
