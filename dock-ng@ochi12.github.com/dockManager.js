import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {DockNG, DockNGHotArea} from './dockNG.js';

export class DockNGManager {
    constructor(_extension) {
        /* We well support multimitor support later on*/
        const monitorIndex = Main.layoutManager.primaryIndex;
        const monitor = Main.layoutManager.monitors[monitorIndex];

        this._dockNG = new DockNG();

        this._dockNGHotArea = new DockNGHotArea(
            Main.layoutManager, monitor);
        this._dockNGHotArea.setBarrierSize(200);

        this._dockNGHotArea.connectObject('triggered', () => {
            this._dockNG.showDock(true);
        }, this);

        Main.layoutManager.addChrome(this._dockNGHotArea);
    }

    destroy() {
        this._dockNG?.destroy();
        this._dockNG = null;

        if (this._dockNGHotArea) {
            this._dockNGHotArea.disconnectObject(this);

            if (this._dockNGHotArea.get_parent())
                this._dockNGHotArea.get_parent().remove_child(this._dockNGHotArea);

            this._dockNGHotArea.destroy();
            this._dockNGHotArea = null;
        }
    }
}
