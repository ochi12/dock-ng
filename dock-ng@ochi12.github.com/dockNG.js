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

const HOT_AREA_TRIGGER_SPEED = 70; // dash to dock has too much pressure treshold
const HOT_AREA_TRIGGER_TIMEOUT = 550; // prevent spam. A little bit more than DOCK_AUTOHIDE_TIMEOUT
const BARRIER_SIZE_FACTOR = 0.20; // 20 percent of monitor width

const baseIconSizes = [16, 22, 24, 32, 48, 64]; // copied from upstrean dash.

// This class is base on Layout.HotCorner
export const DockNGHotArea = GObject.registerClass({
    Signals: {
        'triggered': {},
    },
}, class DockNGHotArea extends Clutter.Actor {
    _init(layoutManager, monitor) {
        super._init();

        this._entered = false;
        this._monitor = monitor;

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

        const centerX = this._monitor.width / 2;
        const bottom =  this._monitor.height;
        const sideX = (this._monitor.width * BARRIER_SIZE_FACTOR) / 2;

        this._horizontalBarrier = new Meta.Barrier({
            backend: global.backend,
            x1: centerX - sideX, x2: centerX + sideX,
            y1: bottom, y2: bottom,
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


export const DockNG = GObject.registerClass(
class DockNG extends Dash.Dash {
    _init(monitorIndex) {
        super._init();

        this._addChrome();

        this._monitorIndex = monitorIndex;
        this._monitor = Main.layoutManager.monitors[monitorIndex];

        this._workArea = null;
        this._autohide_timeout_id = 0;
        this._menuOpened = false;

        global.display.connectObject(
            'workareas-changed', this._updateDockArea.bind(this), this);
        Main.overview.connectObject(
            'shown', () => this.showDock(false, false),
            'item-drag-begin', () => {
                this._draggingItem = true;
            },
            'item-drag-end', () => {
                this._draggingItem = false;
            }, this);

        this._dashContainer.set_track_hover(true);
        this._dashContainer.set_reactive(true);
        this._dashContainer.connectObject('notify::hover',
            this._onHover.bind(this), this);

        this._draggingItem = false;

        this._isIconSizeChanged = false;
        this._oldIconSize = this.iconSize;

        this.connectObject(
            'icon-size-changed', () => {
                // we only monitor icon unpinning here
                // meaning this._isIconSizeChanged is only true
                // if icon size grew.
                this._isIconSizeChanged = this._oldIconSize < this.iconSize;
                this._oldIconSize = this.iconSize;
            },
            this);

        this._updateDockArea();
    }


    vfunc_allocate(box) {
        super.vfunc_allocate(box);

        if (!this._isIconSizeChanged)
            return;

        if (this._workArea) {
            const targetY = this._workArea.y + this._workArea.height - this.height;

            this.ease({
                y: targetY,
                duration: 200,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        const oldIconSize = baseIconSizes[Math.max(0, baseIconSizes.indexOf(this.iconSize) - 1)];
        const scale = oldIconSize / this.iconSize;

        let iconChildren = this._box.get_children().filter(actor => {
            return actor.child &&
                   actor.child._delegate &&
                   actor.child._delegate.icon &&
                   !actor.animatingOut;
        });

        iconChildren.push(this._showAppsIcon);

        iconChildren.forEach(child => {
            const icon = child.child._delegate.icon;

            icon.setIconSize(this.iconSize);

            let [targetWidth, targetHeight] = icon.icon.get_size();

            // Scale the icon's texture to the previous size and
            // tween to the new size
            icon.icon.set_size(
                icon.icon.width * scale,
                icon.icon.height * scale);

            icon.icon.ease({
                width: targetWidth,
                height: targetHeight,
                duration: 200,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        });

        if (this._separator) {
            this._separator.ease({
                height: this.iconSize,
                duration: 200,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        this._isIconSizeChanged = false;
    }

    _queueRedisplay() {
        if (this._workId)
            Main.queueDeferredWork(this._workId);
    }

    _onSizeChanged() {
        if (!this._workArea || Main.overview.visible)
            return;

        if (!this._isIconSizeChanged)
            return;

        this._isIconSizeChanged =  false;

        const targetY = this._workArea.y + this._workArea.height - this.height;
        const targetX = this._workArea.x;

        this.set_position(targetX, targetY);
    }

    _addChrome() {
        Main.layoutManager.addChrome(this, {
            // affectsStruts: true,
            trackFullscreen: true,
        });
    }

    _untrackChrome() {
        Main.layoutManager.untrackChrome(this);
    }

    _updateDockArea() {
        this._workArea = Main.layoutManager.getWorkAreaForMonitor(this._monitorIndex);
        if (!this._workArea)
            return;

        const maxDockHeight = Math.round(this._workArea.height * DOCK_MAX_HEIGHT_RATIO);

        this.setMaxSize(this._workArea.width, maxDockHeight);
        this.set_width(this._workArea.width);
        this.set_height(Math.min(maxDockHeight,
            this.get_preferred_height(this.width)));

        this.showDock(true, false);
        if (!this._dashContainer.get_hover() || Main.overview.visible)
            this.showDock(false, false);

        if (this.is_visible()) {
            this.set_position(this._workArea.x,
                this._workArea.y + this._workArea.height - this.height);
        } else {
            this.set_position(this._workArea.x,
                this._workArea.y + this._workArea.height);
        }
    }

    _adjustIconSize() {
        super._adjustIconSize();
    }

    _onHover() {
        if (this._menuOpened && this._dashContainer.get_hover())
            return;

        if (this._autohide_timeout_id > 0) {
            GLib.source_remove(this._autohide_timeout_id);
            this._autohide_timeout_id = 0;
        }

        this._autohide_timeout_id = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            DOCK_AUTOHIDE_TIMEOUT,
            () => {
                if (!this._dashContainer.get_hover() && !this._draggingItem && !this._menuOpened) {
                    this.showDock(false, true);

                    this._autohide_timeout_id = 0;
                    return GLib.SOURCE_REMOVE;
                }

                return GLib.SOURCE_CONTINUE;
            });
    }

    showDock(show, animate = true) {
        if (!this._workArea)
            return;

        if (show)
            this.show();

        const hideY = this._workArea.y + this._workArea.height;
        const showY = hideY - this.height;

        this.ease({
            y: show ? showY : hideY,
            duration: animate ? 250 : /* larger than 0 force proper redraw */ 1,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (!show)
                    this.hide();
            },
        });
    }

    // override original _itemMenuStateChanged
    _itemMenuStateChanged(item, opened) {
        super._itemMenuStateChanged(item, opened);
        this._menuOpened = opened;
        this._onHover();
    }

    destroy() {
        if (this._autohide_timeout_id > 0) {
            GLib.source_remove(this._autohide_timeout_id);
            this._autohide_timeout_id = 0;
        }

        this.disconnectObject(this);
        global.display.disconnectObject(this);
        Main.overview.disconnectObject(this);
        this._dashContainer.disconnectObject(this);

        this._untrackChrome();

        this._workId = null;

        super.destroy();
    }
});
