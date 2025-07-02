class PublicGroupExplorer {
    constructor(container, store, context, eventBus) {
        this.container = container;
        this.store = store;
        this.ctx = context;
        this.eventBus = eventBus;
    }

    render() {
        this.container.innerHTML = `
            <div class="flex flex-col h-full">
                <div class="flex items-center justify-between p-3 bg-gray-800 border-b border-gray-700">
                    <button id="btn-back" class="text-white text-lg"><i class="fas fa-arrow-left"></i></button>
                    <input id="group-search" type="text" class="bg-gray-700 text-white rounded p-1 text-sm" placeholder="Rechercher un groupe" />
                </div>
                <div class="flex-1 overflow-y-auto p-3 space-y-2" id="group-explorer-list">
                    <div class="text-gray-500 text-center">Chargement...</div>
                </div>
            </div>
        `;
        this.loadGroups();
        this.attachEvents();
    }

    attachEvents() {
        this.container.querySelector('#btn-back').addEventListener('click', () => {
            window.UtopixiaChat.ScreenManager.show('groupList');
        });
        this.container.querySelector('#group-search').addEventListener('input', (e) => {
            this.filterGroups(e.target.value);
        });
    }

    loadGroups() {
        const $this = this
        // Exemple simplifié : à remplacer par un appel Wormhole/Blackhole qui liste les groupes publics
        Blackhole.getGraph("048d5c2d-85b6-4d5a-a994-249f6032ec3a", "https://utopixia.com").then((graph) => {
            $this.parsePublicGroups(graph).then((groups) => {
                $this.allGroups = groups
                $this.displayGroups(groups);
            })

        }).catch((e) => {
            console.error("Erreur lors du chargement des groupes publics", e);
            $this.container.querySelector('#group-explorer-list').innerHTML = '<div class="text-red-500 text-center">Erreur de chargement</div>';
        });
    }

    parsePublicGroups(graph) {
        const promises = graph.object.children
            .filter(node => node["group-is_public"] === "true")
            .map((node) => {
                const groupMetadata = {
                        graphID: node.graphID,
                        name:node["group-name"] || node.name || "Groupe sans nom",
                        description:node["group-description"] || "",
                        owner:node["group-owner"] || "",
                }
                return new Promise((resolve) => {
                    Blackhole.getGraph(groupMetadata.graphID, "https://utopixia.com").then((groupGraph) => {
                        groupMetadata.name = groupGraph.object['graphName']
                        groupMetadata.icon = groupGraph.object['group-icon']
                        groupMetadata.owner = groupGraph.object['group-owner']
                        resolve(groupMetadata);
                    }).catch(() => {
                        resolve(groupMetadata); // Si échec, on retourne quand même le groupe
                    });
                })
            });

        return new Promise((resolve) => {
            Promise.all(promises).then((groups) => {
                resolve(groups);
            });
        })
    }
    joinGroup(groupID) {
        const writeService = new GraphWriteService(window.UtopixiaChat.app.sync.eventManager, this.ctx.address);
        writeService.joinGroup(groupID).then(() => {
            this.reloadGroups();
        }).catch((err) => {
            console.error("Erreur joinGroup :", err);
            alert("Erreur lors du joinGroup : " + err);
        });
    }

    quitGroup(groupID) {
        const writeService = new GraphWriteService(window.UtopixiaChat.app.sync.eventManager, this.ctx.address);
        writeService.leaveGroup(groupID).then(() => {
            this.reloadGroups();
        }).catch((err) => {
            console.error("Erreur leaveGroup :", err);
            alert("Erreur lors du leaveGroup : " + err);
        });
    }

    reloadGroups() {
        const $this = this;
        window.UtopixiaChat.app.graph.fetchUserGroups(window.UtopixiaChat.app.sync.eventManager, this.ctx.address).then((groups) => {
            $this.ctx.setGroups(groups);
            $this.store.saveGroups(groups.map(g => g.serialize()));
            $this.loadGroups(); // recharge la liste des groupes publics avec l'état à jour
        });
    }

    displayGroups(groups) {
        const list = this.container.querySelector('#group-explorer-list');
        list.innerHTML = '';
        if (groups.length === 0) {
            list.innerHTML = '<div class="text-gray-500 text-center">Aucun groupe trouvé</div>';
            return;
        }
        groups.forEach(g => {
            const isMember = this.ctx.groups.some(group => group.id === g.graphID);
            const button = isMember ? `<button class="bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs" data-quit="${g.graphID}">Quitter</button>`
                : `<button class="bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs" data-join="${g.graphID}">Rejoindre</button>`;
            const item = document.createElement('div');
            item.className = 'p-2 bg-gray-800 rounded flex justify-between items-center';
            item.innerHTML = `
                <div>
                    <div class="flex items-center gap-2">
    <img src="${g.icon && g.icon.startsWith('http') ? g.icon : 'https://utopixia.com' + g.icon}" class="w-16 h-16 rounded-full border border-gray-600" />
    <div>
        <div class="font-bold">${g.name}</div>
        <div class="text-xs text-gray-400">${g.description || ''}</div>
    </div>
</div>

                </div>
                ${button}
            `;
            list.appendChild(item);
        });
        this.bindJoinQuitActions();
    }

    bindJoinQuitActions() {
        this.container.querySelectorAll('[data-join]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-join');
                this.joinGroup(id);
            });
        });
        this.container.querySelectorAll('[data-quit]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-quit');
                this.quitGroup(id);
            });
        });
    }

    filterGroups(query) {
        const filtered = this.allGroups.filter(g => g.name.toLowerCase().includes(query.toLowerCase()));
        this.displayGroups(filtered);
    }

    destroy() {
        // Clean up si nécessaire
    }
}

window.UtopixiaChat = window.UtopixiaChat || {};
window.UtopixiaChat.PublicGroupExplorer = PublicGroupExplorer;
