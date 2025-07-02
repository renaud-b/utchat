class UserProfileScreen {
    constructor(container, store, context, eventBus, eventManager) {
        this.container = container;
        this.store = store;
        this.ctx = context;
        this.eventBus = eventBus;
        this.eventManager = eventManager;
    }

    render() {
        const userObject = this.ctx.profile || {};
        this.container.innerHTML = `
            <div class="flex flex-col h-full overflow-y-auto p-4 text-center space-y-4">
                            <div class="flex items-center justify-between p-3 bg-gray-800">
                    <button id="btn-back-profile" class="text-white text-lg">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                </div>

                <div class="text-2xl font-bold">
                    <span id="token-balance">0</span> π
                    <span id="staked-token-balance"></span>
                </div>
                <img src="${Context.getSafeProfilePicture(userObject.object)}" class="w-24 h-24 rounded-full mx-auto cursor-pointer" id="screen-profile-picture">
                <div class="text-xs text-slate-400 flex items-center justify-center gap-2" id="screen-profile-address-container">
                    <span id="screen-profile-address">${this.ctx.address}</span>
                    <button id="copy-profile-address-btn" class="text-blue-400 text-sm">
                        📋
                    </button>
                </div>
                <div class="mt-4">
                    <canvas id="profile-qrcode" class="mx-auto"></canvas>
                </div>

                <input class="w-full bg-gray-800 text-white p-2 rounded border border-gray-600" placeholder="Pseudo" id="profile-input-name" value="${convertHtmlCodesToAccents(userObject.object.graphName || '')}">
                <textarea rows="3" class="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 min-h-[64px]" placeholder="Description..." id="profile-input-description">${convertHtmlCodesToAccents(userObject.object.description || '')}</textarea>
                <button class="mt-4 border border-gray-600 text-gray-600 px-4 py-2 rounded invisible" id="update-user-profile-btn" disabled>Enregistrer</button>
                <div class="border-t border-gray-700 pt-4">
                    <div class="text-xl font-bold">🎖️ Badges</div>
                    <div class="flex flex-wrap gap-2 justify-center mt-4" id="profile-badges">
                        <span class="text-slate-500 text-sm">Chargement...</span>
                    </div>
                </div>
                <button id="btn-logout" class="mt-6 border border-gray-600 hover:bg-gray-500 text-gray-600 px-4 py-2 rounded">
                    Se déconnecter
                </button>
            </div>
        `;

        this.loadData();
        this.attachEvents();
    }

    loadData() {
        const tokenElem = document.getElementById("token-balance");
        const stakedElem = document.getElementById("staked-token-balance");
        const badgeContainer = document.getElementById("profile-badges");



        Wormhole.getUserCoins(this.ctx.address).then((res) => {
            tokenElem.textContent = res.coins ?? 0;
            stakedElem.textContent = res.staked ? `(<i class="fas fa-lock"></i> ${res.staked})` : '';
        });

        Wormhole.getUserBadges(this.ctx.address).then((badges) => {
            badgeContainer.innerHTML = "";
            if (badges.length === 0) {
                badgeContainer.innerHTML = "<span class='text-slate-500 text-sm'>Aucun badge</span>";
                return;
            }
            badges.forEach((badge) => {
                const badgeElem = document.createElement("div");
                badgeElem.className = "relative group cursor-pointer";
                let badgeImage = badge.information.image;
                if(badgeImage.indexOf("http") !== 0) {
                    badgeImage = `https://utopixia.com${badgeImage}`;
                }
                badgeElem.innerHTML = `
                    <img src="${badgeImage}" alt="${badge.information.name}" class="w-24 h-24 rounded-full border border-gray-700 hover:ring hover:ring-blue-400" />
                    ${badge.information.maxLevel > 1
                    ? `<span class="absolute bottom-0 right-0 bg-blue-600 text-white text-[10px] px-1 py-[1px] rounded-full">${badge.level}/${badge.information.maxLevel}</span>`
                    : ""
                }
                `;
                badgeElem.addEventListener("click", () => {
                    document.getElementById("badge-title").textContent = badge.information.name;
                    document.getElementById("badge-description").textContent = badge.information.description;
                    document.getElementById("badge-level").textContent = `Niveau ${badge.level} / ${badge.information.maxLevel}`;
                    let img = badge.information.image;
                    if (img.indexOf("http") !== 0) {
                        img = `https://utopixia.com${img}`;
                    }
                    document.getElementById("badge-modal-image").src = img;
                    document.getElementById("modal-badge-details").classList.remove("hidden");
                });
                badgeContainer.appendChild(badgeElem);
            });
        });

        const qr = new QRious({
            element: document.getElementById("profile-qrcode"),
            value: `utopixia:address:${this.ctx.address}`,
            size: 192,
            background: 'transparent',
            foreground: '#ffffff'
        });

    }

    attachEvents() {
        const nameInput = document.getElementById("profile-input-name");
        const descInput = document.getElementById("profile-input-description");
        const saveBtn = document.getElementById("update-user-profile-btn");

        const initialName = nameInput.value.trim();
        const initialDesc = descInput.value.trim();

        function updateButtonState() {
            const name = nameInput.value.trim();
            const desc = descInput.value.trim();
            const hasChanged = name !== initialName || desc !== initialDesc;
            saveBtn.disabled = !hasChanged;
            saveBtn.classList.toggle("invisible", !hasChanged);
        }

        nameInput.addEventListener("input", updateButtonState);
        descInput.addEventListener("input", updateButtonState);

        saveBtn.addEventListener("click", () => {
            Utils.showGlobalLoading("Mise à jour du profil...");
            Wormhole.getUserProfile(this.ctx.address).then((profileRoot) => {
                const actions = [];
                if (nameInput.value.trim() !== initialName) {
                    actions.push(Blackhole.Actions.update(profileRoot.object.id, "graphName", convertAccentsToHtmlCodes(nameInput.value.trim())));
                }
                if (descInput.value.trim() !== initialDesc) {
                    actions.push(Blackhole.Actions.update(profileRoot.object.id, "description", convertAccentsToHtmlCodes(descInput.value.trim())));
                }
                const groupAction = Blackhole.Actions.makeGroup(profileRoot.graphID, ...actions);
                this.eventManager.sign(this.ctx.address, groupAction, 0).then((signedTx) => {
                    Singularity.saveSignedTx(signedTx).then((res) => {
                        Singularity.waitForTx(res.UUID).then(() => {
                            Utils.hideGlobalLoading();
                            saveBtn.disabled = true;
                            saveBtn.classList.add("invisible");
                        });
                    });
                });
            });
        });

        document.getElementById("btn-logout").addEventListener("click", () => {
            const event = { type: "disconnect" };
            new Promise((resolve, reject) => {
                try {
                    this.eventManager.send(event, resolve);
                    this.store.removeAll()
                } catch (error) {
                    reject(error);
                }
            })
                .then(() => {
                    console.log("user disconnected");
                })
                .catch((err) => {
                    console.error("Erreur lors de la déconnexion :", err);
                });
        });


        this.container.querySelector("#btn-back-profile").addEventListener("click", () => {
            window.UtopixiaChat.ScreenManager.show("groupList");
        });

        const copyBtn = document.getElementById("copy-profile-address-btn");
        const addrElem = document.getElementById("screen-profile-address");

        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(addrElem.textContent).then(() => {
                copyBtn.textContent = "✅";
                setTimeout(() => {
                    copyBtn.textContent = "📋";
                }, 2000);
            });
        });

    }

    destroy() {
        // Nettoyage éventuel
    }
}

window.UtopixiaChat = window.UtopixiaChat || {};
window.UtopixiaChat.UserProfileScreen = UserProfileScreen;
