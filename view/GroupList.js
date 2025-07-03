class GroupList {
    constructor(eventManager, container, store, graph, context, eventBus, writeService) {
        this.eventManager = eventManager;
        this.container = container;
        this.graph = graph;
        this.store = store;
        this.ctx = context;
        this.eventBus = eventBus;
        this.writeService = writeService;
        this.selectedContacts = []

        if (!this.ctx.selectedGroupId && this.ctx.groups.length > 0) {
            this.ctx.selectedGroupId = this.ctx.groups[0].id;
        }

        this.handleGroupUpdateFunc = this.rerender.bind(this);
        this.handleMessagesUpdateFunc = this.handleMessagesUpdate.bind(this);

        this.eventBus.on('groups:updated', this.handleGroupUpdateFunc);
        this.eventBus.on('messages:updated', this.handleMessagesUpdateFunc);
    }

    destroy() {
        this.eventBus.off('groups:updated', this.handleGroupUpdateFunc);
        this.eventBus.off('messages:updated', this.handleMessagesUpdateFunc);
    }

    handleMessagesUpdate(data) {
        const group = this.ctx.findGroupByThreadId(data.threadId);
        if (group && group.id === this.ctx.selectedGroupId) {
            this.rerender();
        }
    }

    rerender() {
        this.render();
    }

    renderGroupHTML(g, groupId, unread) {
        const isSelected = g.id === groupId && !g.isSelector;
        const avatarHTML = g.avatar.includes('http')
            ? `<img src="${g.avatar}" class="w-full h-full rounded-full" />`
            : `<span class="text-xl">${g.avatar}</span>`;
        return `
            <div class="relative w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center text-white cursor-pointer hover:ring-2 hover:ring-white transition
                        ${isSelected ? 'ring-2 ring-blue-400' : ''}"
                 data-group-id="${g.id}">
              ${avatarHTML}
               ${unread > 0 ? `<span class="absolute -top-1 -right-1 bg-blue-600 text-xs rounded-full px-2 py-0.5">${unread}</span>` : ""}
            </div>
        `;
    }

    renderThreadHTML(thread) {
        const lastMessage = thread.getLastMessage();
        const preview = lastMessage ? this.truncate(lastMessage.content, 40) : "Aucun message pour l’instant";
        const formattedDate = lastMessage ? this.formatDate(lastMessage.timestamp) : "";
        const unreadCount = thread.messages.filter((m) => {
            return m.timestamp > (thread.lastReadTimestamp || 0) && m.author !== this.ctx.address;
        }).length;

        return `
            <li class="p-3 bg-gray-800 rounded hover:bg-gray-700 cursor-pointer transition"
                data-thread-id="${thread.id}">
                <div class="flex items-center">
                    ${unreadCount > 0 ? `<span class="ml-2 bg-blue-600 text-xs rounded-full px-2 py-0.5">${unreadCount}</span>` : ""}
                    <div class="text-lg ml-2"># ${thread.name || 'Sans nom'}</div>
                </div>
                <div class="text-sm text-gray-400 flex justify-between">
                    <span>${preview}</span>
                    <span class="ml-4 whitespace-nowrap">${formattedDate}</span>
                </div>
            </li>
        `;
    }

    render() {
        const groupId = this.ctx.selectedGroupId;
        const selectedGroup = this.ctx.findGroupById(groupId);
        const threads = selectedGroup.threads;
        const groupUnreadMap = {};
        this.ctx.groups.forEach(group => {
            groupUnreadMap[group.id] = group.threads.reduce((sum, thread) => {
                return sum + thread.messages.filter((m) => {
                    return m.timestamp > (thread.lastReadTimestamp || 0) && m.author !== this.ctx.address;
                }).length;
            }, 0);
        });
        const isPrivate = selectedGroup.isPrivate;
        const isOwner = selectedGroup.owner === this.ctx.address;
        this.container.innerHTML = `
            <div class="flex flex-1 overflow-hidden" style="height: 85%;">
                <div class="w-24 bg-gray-900 flex flex-col items-center py-4 space-y-4 overflow-y-auto border-r border-gray-800" id="group-list-container">
                    ${this.ctx.groups.map(g => this.renderGroupHTML(g, groupId, groupUnreadMap[g.id])).join('')}
                </div>
                <div class="flex-1 p-4 overflow-y-auto">
                    <h2 class="text-xl font-bold mb-4 flex justify-between items-center">
                      ${selectedGroup.name || '📂 Discussions'}
                      ${(isOwner || isPrivate) ? '<button id="btn-add-thread" class="ml-2 bg-blue-600 hover:bg-blue-700 text-white rounded px-2">+</button>' : ''}
                    </h2>

                    <ul class="space-y-2" id="thread-list-container">
                        ${threads.map(t => this.renderThreadHTML(t)).join('')}
                    </ul>
                </div>
            </div>
            <div class="w-full h-20 flex justify-around items-center bg-gray-800 border-t border-gray-700">
                <button id="btn-contacts" class="w-12 h-12 hover:bg-gray-600 text-white text-xl rounded" style="font-size: 2em;">
                    <i class="fas fa-address-book"></i>
                </button>
                <button id="user-profile-btn" class="w-12 h-12 hover:bg-gray-600 text-white text-xl rounded" style="font-size: 2em;">
                    <i class="fas fa-user-cog"></i>
                </button>
            </div>
        `;

        this.attachGroupEvents(selectedGroup);
        this.attachThreadEvents();
        this.attachFooterEvents();
    }

    attachGroupEvents(selectedGroup) {
        this.container.querySelectorAll('[data-group-id]').forEach(icon => {
            icon.addEventListener('click', () => {

                const id = icon.getAttribute('data-group-id');
                const group = this.ctx.findGroupById(id);

                if (group && group.isSelector) {
                    window.UtopixiaChat.ScreenManager.show("publicGroupExplorer");
                    return;
                }
                this.ctx.setGroupId(id);
                this.store.saveGroupId(id);

                this.graph.fetchUserGroups(eventManager, this.ctx.address).then(groups => {
                    this.ctx.setGroups(groups);
                    this.store.saveGroups(this.ctx.groups.map(g => g.serialize()));
                    //this.render();
                });
            });
        });
        const btnAddThread = this.container.querySelector('#btn-add-thread');
        if (btnAddThread) {
            const isPrivate = selectedGroup.isPrivate;
            btnAddThread.addEventListener('click', () => {
                if (isPrivate) {
                    this.showPrivateConversationModal();
                } else {
                    document.getElementById('modal-create-thread').classList.remove('hidden');
                }
            });
        }
    }

    showPrivateConversationModal() {
        const modal = document.getElementById('modal-start-private-conversation');
        const list = document.getElementById('private-conversation-contacts');
        list.innerHTML = "";

        this.ctx.contacts.forEach(contact => {
            const li = document.createElement('li');
            li.className = 'p-2 bg-gray-700 rounded cursor-pointer hover:bg-gray-600 flex items-center gap-2';
            li.innerHTML = `
      <img src="${contact.avatar}" class="w-8 h-8 rounded-full">
      <span>${contact.name}</span>
    `;
            li.dataset.address = contact.address;
            li.addEventListener('click', () => {
                li.classList.toggle('border');
                li.classList.toggle('border-blue-600');
                if (this.selectedContacts.includes(contact.address)) {
                    this.selectedContacts = this.selectedContacts.filter(addr => addr !== contact.address);
                } else {
                    this.selectedContacts.push(contact.address);
                }

            });
            list.appendChild(li);
        });

        this.selectedContacts = [];
        modal.classList.remove('hidden');

        const validateBtn = document.getElementById('btn-validate-private-conversation');
        validateBtn.onclick = () => {
            if (this.selectedContacts) {
                this.selectedContacts.push(this.ctx.address)
                this.writeService.createPrivateConversation(this.selectedContacts).then((contractResponse) => {
                    const privateThreadID = contractResponse.privateGraphID;
                    const conversationTitle = contractResponse.conversationTitle;
                    const currentGroup = this.ctx.getCurrentGroup()
                    const newThread = currentGroup.createPrivateThread(privateThreadID, Date.now())
                    newThread.name = conversationTitle
                })
                modal.classList.add('hidden');
            } else {
                alert("Veuillez sélectionner un contact.");
            }
        };
    }


    attachThreadEvents() {
        this.container.querySelectorAll('[data-thread-id]').forEach(item => {
            item.addEventListener('click', () => {
                const threadId = item.getAttribute('data-thread-id');
                this.ctx.setThreadId(threadId);
                this.store.saveThreadId(threadId);
                window.UtopixiaChat.ScreenManager.show('messageView', { threadId }, { direction: 'left' });
            });
        });
    }

    attachFooterEvents() {
        this.container.querySelector("#btn-contacts").addEventListener("click", () => {
            window.UtopixiaChat.ScreenManager.show("contactsList");
        });
        this.container.querySelector("#user-profile-btn").addEventListener("click", () => {
            window.UtopixiaChat.ScreenManager.show("userProfile");
        });
    }

    truncate(text, maxLength) {
        return marked.parse(text.length > maxLength ? text.slice(0, maxLength) + "…" : text);
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        const options = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleDateString('fr-FR', options);
    }
}

window.UtopixiaChat = window.UtopixiaChat || {};
window.UtopixiaChat.GroupList = GroupList;
