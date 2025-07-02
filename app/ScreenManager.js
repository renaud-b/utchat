class ScreenManager {
    constructor() {
        this.currentScreen = null;
        this.screens = {};
        this.historyStack = [];
    }

    register(screenId, renderFn) {
        this.screens[screenId] = renderFn;
    }

    show(screenId, data = {}, options = { direction: 'right' }) {
        if (this.currentScreen && this.currentScreen !== screenId) {
            this.historyStack.push({
                screenId: this.currentScreen,
                data: this.lastData // conserver les données passées
            });
            this.hide(this.currentScreen);
        }
        if (this.screens[screenId] && this.currentScreen !== screenId) {
            this.currentScreen = screenId;
            this.lastData = data;
            this.screensInstances = this.screensInstances || {};

            const screenWrapper = document.createElement('div');
            screenWrapper.classList.add('absolute', 'inset-0', 'transition-transform', 'duration-500');
            screenWrapper.id = `screen-${screenId}`;
            document.getElementById("screen").appendChild(screenWrapper);
            const instance = this.screens[screenId](data, screenWrapper);

            if (instance) {
                this.screensInstances[screenId] = instance;
            }
        }
    }

    back() {
        if (this.historyStack.length > 0) {
            const last = this.historyStack.pop();
            this.show(last.screenId, last.data);
        } else {
            console.warn("Aucun écran précédent");
        }
    }

    hide(screenId) {
        if (this.screensInstances && this.screensInstances[screenId]) {
            if (typeof this.screensInstances[screenId].destroy === 'function') {
                this.screensInstances[screenId].destroy();
            }
            delete this.screensInstances[screenId];
        }

        const el = document.getElementById("screen");
        if (el) el.innerHTML = '';
    }
}

window.UtopixiaChat = window.UtopixiaChat || {};
window.UtopixiaChat.ScreenManager = new ScreenManager();