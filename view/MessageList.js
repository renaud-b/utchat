class MessageList {
    constructor(container, store, writeService, context, eventBus, threadId, notificationService) {
        this.currentReplyToId = null;
        this.container = container;
        this.store = store
        this.writeService = writeService;
        this.ctx = context;
        this.eventBus = eventBus;
        this.thread = this.ctx.findThreadById(threadId);
        this.notificationService = notificationService

        if(this.thread){
            this.thread.lastReadTimestamp = Date.now();
            this.store.saveThreadLastReadTimestamp(this.thread.id, this.thread.lastReadTimestamp);
        }
        this.messageNodes = [];
        this.handleMessagesUpdateFunc = this.handleMessagesUpdate.bind(this);
        this.eventBus.on('messages:updated', this.handleMessagesUpdateFunc);
        this.handleUsersUpdateFunc = this.handleUserUpdate.bind(this);
        this.eventBus.on('users:updated', this.handleUsersUpdateFunc);
        this.handleThreadUpdateFunc = this.handleThreadUpdate.bind(this);
        this.eventBus.on('thread:updated', this.handleThreadUpdateFunc);

        this.boundHandleAddUser = this.handleAddUser.bind(this);
        this.boundHandleRemoveUser = this.handleRemoveUser.bind(this);

        document.getElementById('group-config-add-user-btn').addEventListener('click', this.boundHandleAddUser);
        document.getElementById('group-config-user-list').addEventListener('click', this.boundHandleRemoveUser);
    }


    destroy() {
        this.eventBus.off('messages:updated', this.handleMessagesUpdateFunc);
        this.eventBus.off('users:updated', this.handleUsersUpdateFunc);
        this.eventBus.off('thread:updated', this.handleThreadUpdateFunc);
        document.getElementById('group-config-add-user-btn').removeEventListener('click', this.boundHandleAddUser);
        document.getElementById('group-config-user-list').removeEventListener('click', this.boundHandleRemoveUser);
    }

    handleThreadUpdate(data) {
        if (data.id === this.thread.id) {
            this.thread.name = data.name || this.thread.name;
            this.thread.notificationsEnabled = data.notificationsEnabled || this.thread.notificationsEnabled;

            const threadNameEl = this.container.querySelector('#thread-name');
            if (threadNameEl) {
                threadNameEl.textContent = this.thread.name || "Sans nom";
            }

            if(this.thread.type === 'private'){
                this.updateMessageNodes(data.messages || []);
            }
        }
    }


    handleRemoveUser(e) {
        if (e.target.matches('[data-remove-user]')) {
            const addr = e.target.getAttribute('data-remove-user');
            this.thread.allowedUsers = this.thread.allowedUsers.filter(a => a !== addr);
            e.target.closest('li').remove();
        }
    }
    handleAddUser() {
        const addrInput = document.getElementById('group-config-add-user');
        const addr = addrInput.value.trim();
        if (!addr) return;

        if (!this.thread.allowedUsers) {
            this.thread.allowedUsers = [];
        }

        // Vérifie doublon
        if (this.thread.allowedUsers.includes(addr)) {
            alert("Cet utilisateur est déjà dans la liste.");
            return;
        }

        // Tente de récupérer le profil (optionnel mais recommandé)
        Wormhole.getUserProfile(addr).then(profile => {
            const pseudo = convertHtmlCodesToAccents(profile.object.graphName) || addr;
            const avatar = Context.getSafeProfilePicture(profile.object);

            this.thread.allowedUsers.push(addr);

            const userList = document.getElementById('group-config-user-list');

            const li = document.createElement('li');
            li.className = "flex items-center gap-2";
            li.innerHTML = `
      <img src="${avatar}" class="w-6 h-6 rounded-full">
      <span>${pseudo}</span>
      <button class="text-red-400 hover:text-red-600" data-remove-user="${addr}">×</button>
    `;
            userList.appendChild(li);

            addrInput.value = "";
        }).catch(() => {
            alert("Impossible de récupérer le profil de cet utilisateur.");
        });
    }


    handleMessagesUpdate(data) {
        const threadId = data.threadId;
        const newMessages = data.messages || [];

        if (this.thread && this.thread.id === threadId) {
            this.updateMessageNodes(newMessages)
        }
    }

    updateMessageNodes(messages) {
        messages.forEach((message) => {
            // Vérifier si le message est déjà dans les messageNodes
            const existingIndex = this.messageNodes.findIndex(msg => msg.id === message.id);

            if (existingIndex !== -1) {
                // Mise à jour du modèle
                this.messageNodes[existingIndex] = message;

                // Mise à jour du DOM
                const existingNode = this.container.querySelector(`#msg-${message.id}`);
                if (existingNode) {
                    const newNode = this.buildMessageNode(message, this.ctx.users[message.author] || null);
                    existingNode.replaceWith(newNode);
                }
            } else {
                // Nouveau message : on l'ajoute au modèle et au DOM
                const newNode = this.buildMessageNode(message, this.ctx.users[message.author] || null);
                this.container.querySelector('#messages-container').appendChild(newNode);
                this.messageNodes.push(message);
            }
        });

        this.scrollToBottom();
    }

    handleUserUpdate(data) {
        const $this = this
        $this.messageNodes.forEach((msgNode) => {
            if (msgNode.author === data.address) {
                const authorProfile = data.profile;
                if (authorProfile && Object.keys(authorProfile).length > 0) {
                    const newNodeContent = $this.buildMessageNode(msgNode, authorProfile);
                    const msgElement = $this.container.querySelector(`#msg-${msgNode.id}`);
                    if (msgElement) {
                        msgElement.replaceWith(newNodeContent)
                    }
                }
            }
        })
    }

    render() {
        if (!this.thread) {
            this.container.innerHTML = `<div class="flex justify-center items-center h-full text-gray-400">
Thread introuvable
<button id="btn-back" class="text-white text-lg">
                        <i class="fas fa-arrow-left"></i>
                    </button>
</div>`;

            this.attachEvents();
            return;
        }

        this.container.innerHTML = `
            <div class="flex flex-col h-full">
                <!-- Header -->
                <div class="flex items-center justify-between p-3 bg-gray-800 border-b border-gray-700">
                    <button id="btn-back" class="text-white text-lg">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <div class="font-bold text-base truncate" id="thread-name">${this.thread.name || "Sans nom"}</div>
                    <button id="btn-thread-config" class="text-white text-lg">
                        <i class="fas fa-cog"></i>
                    </button>
                    
                </div>

                <!-- Messages -->
                <div id="messages-container" class="flex-1 overflow-y-auto p-3 space-y-1 overflow-x-hidden">
                   
                </div>

                <!-- Composer -->
                <div class="p-2 bg-gray-800 border-t border-gray-700">
                  <div id="reply-preview" class="hidden mb-2 p-2 bg-gray-700 rounded text-sm flex justify-between items-center border-l-4 border-blue-500">
                    <div id="reply-preview-content" class="truncate max-w-xs"></div>
                    <button id="btn-cancel-reply" class="ml-2 text-red-400 hover:text-red-600 text-lg">&times;</button>
                  </div>
                  <div class="flex">
                    <textarea id="msg-input" rows="1" class="flex-1 bg-gray-700 text-white rounded-l px-3 py-2 focus:outline-none resize-none overflow-hidden" placeholder="Votre message..."></textarea>

                    <button id="btn-send" class="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-r">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                  </div>
                </div>

                
            </div>
        `;

        this.attachEvents();
        const messagesContainer = this.container.querySelector('#messages-container');
        const $this = this
        this.thread.messages.forEach(msg => {
            const node = $this.buildMessageNode(msg, $this.ctx.users[msg.author] || null);
            messagesContainer.appendChild(node);
        });
        const bottomAnchor = document.createElement("div");
        bottomAnchor.id = "bottom-anchor";
        bottomAnchor.style.height = "20px";
        bottomAnchor.style.width = "100%";
        messagesContainer.appendChild(bottomAnchor);
        this.scrollToBottom();
    }

    buildMessageNode(msg, authorProfile = null) {
        if(Object.keys(authorProfile).length === 0){
            authorProfile = null
        }
        const isMine = msg.author === this.ctx.address;
        const user = authorProfile || {
            name: msg.author,
            avatar: `https://i.pravatar.cc/40?u=${msg.author}`
        };

        const msgContainer = document.createElement("div");
        msgContainer.id = "msg-" + msg.id;
        msgContainer.classList.add("message", "flex", "gap-3", "mb-2", "no-select");
        msgContainer.setAttribute("data-message-id", msg.id);
        if (isMine) {
            msgContainer.classList.add("justify-end", "text-right");
        } else {
            msgContainer.classList.add("items-center");
        }

        const userIconContainer = document.createElement("div");
        userIconContainer.classList.add("w-10", "h-10", "rounded-full", "flex-shrink-0", "hover:cursor-pointer");
        userIconContainer.style.width = "45px";
        userIconContainer.style.height = "45px";

        const userImg = document.createElement("img");
        userImg.classList.add("rounded-full", "object-cover");
        userImg.style.width = "45px";
        userImg.style.height = "45px";
        userImg.setAttribute("data-address", user.address || msg.author);
        if(user.avatar){
            userImg.src = user.avatar;

        } else {
            userImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2RkZGRkZCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjIwIiBmaWxsPSIjOTk5OTk5Ii8+PHJlY3QgeT0iNjAiIHdpZHRoPSI3MCIgaGVpZ2h0PSI0MCIgeD0iMTUiIGZpbGw9IiM5OTk5OTkiIHJ4PSIxNSIvPjwvc3ZnPg=='
        }
        userImg.addEventListener("click", () => {
            const address = userImg.getAttribute("data-address");
            this.showUserProfileModal(address);
        });
        userIconContainer.appendChild(userImg);

        const msgGroup = document.createElement("div");
        msgGroup.style.marginTop = "10px";
        // Nom + timestamp
        const dateAndUserName = document.createElement("div");
        dateAndUserName.classList.add("text-sm");
        dateAndUserName.classList.add(isMine ? "text-blue-400" : "text-gray-400");
        dateAndUserName.innerHTML = `${isMine ? 'moi' : user.name} 
        <span class="text-xs text-gray-500">${this.formatDate(msg.timestamp)}</span>`;
        msgGroup.appendChild(dateAndUserName);

        // Réponse (si replyTo)
        if (msg.replyTo && Object.keys(msg.replyTo).length > 0) {
            const quoted = document.createElement("div");
            quoted.className =
                "mb-1 px-3 py-2 rounded bg-gray-800 border-l-4 border-blue-500 text-sm text-slate-300 cursor-pointer";
            const respondedToUser = this.ctx.users[msg.replyTo.author] || { name: msg.replyTo.author, avatar: `https://i.pravatar.cc/40?u=${msg.replyTo.author}` };
            quoted.innerHTML = `<strong>${respondedToUser.name}</strong> — ${this.getMessageContent(msg.replyTo.id)}`;

            // Ajout direct du listener ici
            quoted.addEventListener('click', () => {
                const targetNode = this.container.querySelector(`#msg-${msg.replyTo.id}`);
                if (targetNode) {
                    targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetNode.classList.add('border', 'border-blue-500', 'rounded');
                    setTimeout(() => {
                        targetNode.classList.remove('border', 'border-blue-500', 'rounded');
                    }, 2000)
                } else {
                    console.warn("Message node not found for replyTo:", msg.replyTo.id);
                }
            });

            msgGroup.appendChild(quoted);
        }

        // Contenu du message
        const userMsg = document.createElement("div");
        userMsg.classList.add(
            "break-words",
            "text-sm",
            "px-3",
            "py-2",
            "rounded-lg",
            "inline-block",
            "max-w-xs"
        );
        if (isMine) {
            userMsg.classList.add("bg-blue-700", "text-white");
        } else {
            userMsg.classList.add("bg-gray-700", "text-white");
        }
        userMsg.innerHTML = marked.parse(msg.content); // Si tu veux parser du markdown :
        msgGroup.appendChild(userMsg);

        // Réactions
        if (msg.reactions && msg.reactions.length > 0) {
            const reactionMap = {};

            msg.reactions.forEach(r => {
                try  {
                    const emoji = convertHtmlCodesToAccents(FromB64ToUtf8(r.emoji));
                    if (reactionMap[emoji]) {
                        reactionMap[emoji]++;
                    } else {
                        reactionMap[emoji] = 1;
                    }
                }catch(e){
                    console.warn("Message node not found for replyTo:", msg);
                }
            });

            const reactionsDiv = document.createElement("div");
            reactionsDiv.classList.add("flex", "space-x-1", "mt-1", "text-xs", "text-gray-300", "hover:cursor-pointer");
            reactionsDiv.addEventListener("click", () => {
                this.showReactionsModal(msg);
            });
            reactionsDiv.innerHTML = Object.entries(reactionMap)
                .map(([emoji, count]) => `${emoji}${count > 1 ? ` x${count}` : ''}`)
                .join(" ");

            userMsg.appendChild(reactionsDiv);
        }

        if (isMine) {
            msgContainer.appendChild(msgGroup);
            msgContainer.appendChild(userIconContainer);
        } else {
            msgContainer.appendChild(userIconContainer);
            msgContainer.appendChild(msgGroup);
        }

        this.bindMessageActions(msgContainer, msgGroup)
        this.messageNodes.push(msg);

        return msgContainer;
    }
    showUserProfileModal(address) {
        Wormhole.getUserProfile(address).then((profile) => {
            const modal = document.getElementById('modal-profile');
            document.getElementById('profile-name').innerText = convertHtmlCodesToAccents(profile.object.graphName) || address;
            document.getElementById('profile-address').innerText = address;
            document.getElementById('profile-picture').src = Context.getSafeProfilePicture(profile.object);
            document.getElementById('profile-description').innerText = convertHtmlCodesToAccents(profile.object.description || '');
            modal.classList.remove("hidden");
        });
    }
    getMessageContent(messageId) {
        const message = this.thread.messages.find(msg => msg.id === messageId);
        if (message) {
            return message.content;
        }
        return '';
    }


    attachEvents() {
        const $this = this
        this.container.querySelector('#btn-back').addEventListener('click', () => {
            $this.store.saveThreadId(null)
            $this.ctx.setThreadId(null)
            window.UtopixiaChat.ScreenManager.show('groupList');
        });

        const btnSend = this.container.querySelector('#btn-send')
        if (btnSend) {
            btnSend.addEventListener('click', () => {
                this.sendMessage();
            });
        }

        const input = this.container.querySelector('#msg-input');
        if (input) {
            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = input.scrollHeight + 'px';
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
        const configBtn = this.container.querySelector('#btn-thread-config');
        if(configBtn){
            configBtn.addEventListener('click', () => {
                const modal = document.getElementById('modal-thread-config');

                const isPrivate = (this.thread.type === 'private');
                const group = this.ctx.findGroupByThreadId(this.thread.id);
                let isAdmin = false
                if(!isPrivate){
                    isAdmin = (group && group.owner === this.ctx.address) || this.thread.authorizedUsers.some((addr) => addr === this.ctx.address);
                }

                this.notificationService.isNotificationActivated(this.thread.id).then((isActivated) => {
                    console.log("notification state for thread", this.thread.id, ":", isActivated);
                    document.getElementById("group-config-notify").checked = isActivated;
                })

                // Remplir les valeurs
                document.getElementById('group-config-name').value = this.thread.name || "";
                document.getElementById('group-config-notify').checked = this.thread.notificationsEnabled || false;

                if (isPrivate) {
                    // Privé : nom + notifications
                    document.getElementById('group-config-name-container').classList.remove('hidden');
                    document.getElementById('group-config-add-user-container').classList.add('hidden');
                    document.getElementById('delete-thread-btn').classList.add('hidden');
                } else {
                    // Groupe
                    if (isAdmin) {
                        document.getElementById('group-config-name-container').classList.remove('hidden');
                        document.getElementById('group-config-add-user-container').classList.remove('hidden');
                        document.getElementById('delete-thread-btn').classList.remove('hidden');
                    } else {
                        document.getElementById('group-config-name-container').classList.add('hidden');
                        document.getElementById('group-config-add-user-container').classList.add('hidden');
                        document.getElementById('delete-thread-btn').classList.add('hidden');
                    }
                }

                if (!isPrivate && isAdmin) {
                    const userList = document.getElementById('group-config-user-list');
                    userList.innerHTML = ""; // On vide d’abord pour éviter les doublons
                    // On boucle sur les authorizedUsers du thread
                    this.thread.authorizedUsers.forEach(addr => {
                        const addUserEntry = (userList, targetUser) => {
                            const pseudo = convertHtmlCodesToAccents(targetUser.name) || addr;
                            const avatar = Context.getSafeProfilePicture(targetUser.avatar);

                            const li = document.createElement('li');
                            li.className = "flex items-center gap-2";
                            li.innerHTML = `
                            <img src="${avatar}" class="w-6 h-6 rounded-full">
                            <span>${pseudo}</span>
                            <button class="text-red-400 hover:text-red-600" data-remove-user="${addr}">×</button>
                          `;
                            userList.appendChild(li);
                        }
                        const targetUser = this.ctx.users[addr] || null;
                        if(!targetUser){
                            Wormhole.getUserProfile(addr).then((profile) => {
                                const targetUser = {
                                    name: convertHtmlCodesToAccents(profile.object.graphName) || addr,
                                    avatar: Context.getSafeProfilePicture(profile.object),
                                    address: addr
                                };
                                // On ajoute l'élément à la liste
                                addUserEntry(userList, targetUser)
                                // On ajoute l'utilisateur au contexte
                                this.ctx.users[addr] = targetUser;
                                // On save le profil dans le store
                                this.store.saveUser(targetUser.address, targetUser);
                            })
                            return
                        } else {
                            addUserEntry(userList, targetUser)
                        }
                    });
                }


                modal.classList.remove('hidden');
            });
        }

        const cancelReplyBtn = this.container.querySelector('#btn-cancel-reply');
        cancelReplyBtn.addEventListener('click', () => {
            this.currentReplyToId = null;
            this.container.querySelector('#reply-preview').classList.add('hidden');
        });

    }
    bindMessageActions(msgEl, msgGroupEl) {
        const id = msgEl.getAttribute("data-message-id");

        // Desktop : clic droit
        msgGroupEl.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            this.showActionBar(id, msgGroupEl, e);
        });

        // Mobile : long press
        let pressTimer;
        msgGroupEl.addEventListener("touchstart", (e) => {
            pressTimer = setTimeout(() => {
                this.showActionBar(id, msgGroupEl, e);
            }, 600);
        });
        msgGroupEl.addEventListener("touchend", () => {
            clearTimeout(pressTimer);
        });

    }

    showActionBar(messageId, msgEl, event) {
        // Remove old
        const existing = document.getElementById("message-action-bar");
        if (existing) existing.remove();

        // Create new
        const bar = document.createElement("div");
        bar.innerHTML = `
        <div class="absolute bg-gray-800 rounded shadow-lg p-1 flex gap-2 z-50" id="message-action-bar">
            <button class="emoji-btn text-xl">❤️</button>
            <button class="emoji-btn text-xl">👍</button>
            <button class="emoji-btn text-xl">😂</button>
            <button class="emoji-btn text-xl">🤔</button>
            <button class="emoji-btn text-xl">❗</button>
            <button id="msg-action-reply" class="text-white text-xl"><i class="fas fa-reply"></i></button>
            <button id="msg-action-copy" class="text-white text-xl"><i class="fas fa-copy"></i></button>
        </div>
    `;
        this.container.appendChild(bar);

        // Position
        const rect = msgEl.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();
        const actionBar = bar.querySelector("#message-action-bar");
        actionBar.style.top = `${rect.bottom - containerRect.top + 4}px`;
        actionBar.style.left = `${rect.left - containerRect.left}px`;

        // Attach actions
        actionBar.querySelectorAll("button").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation(); // empêche propagation à msgEl
            });
        });

        const $this = this
        actionBar.querySelectorAll(".emoji-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                $this.reactToMessage(messageId, btn.textContent.trim());
                actionBar.remove();
            });
        });

        actionBar.querySelector("#msg-action-reply").addEventListener("click", () => {
            $this.replyToMessage(messageId);
            actionBar.remove();
        });

        actionBar.querySelector("#msg-action-copy").addEventListener("click", () => {
            const msg = this.ctx.messages.find(m => m.id === messageId);
            if (msg) {
                navigator.clipboard.writeText(msg.content).then(() => {
                    // Option : toast / feedback
                });
            }
            actionBar.remove();
        });


        // Écoute globale
        const closeOnClickOutside = (e) => {
            if (!actionBar.contains(e.target)) {
                actionBar.remove();
                document.removeEventListener("click", closeOnClickOutside);
                document.removeEventListener("touchstart", closeOnClickOutside);
                document.removeEventListener("contextmenu", closeOnClickOutside);
            }
        };

        setTimeout(() => { // petit délai pour éviter de fermer instantanément sur le même clic
            document.addEventListener("click", closeOnClickOutside);
            document.addEventListener("touchstart", closeOnClickOutside);
            document.addEventListener("contextmenu", closeOnClickOutside); // pour un clic droit ailleurs
        }, 10);

    }

    reactToMessage(messageId, emoji) {
        const group = this.ctx.findGroupByThreadId(this.thread.id);
        if (!group) {
            console.error("Impossible de trouver le groupe pour ce thread");
            return;
        }
        const groupGraphID = this.thread.type === "private" ? this.thread.graphID : group.id;
        const threadID = (this.thread.type === "private") ? "" : this.thread.threadID;


        // MAJ locale immédiate
        const message = this.thread.messages.find(m => m.id === messageId);
        if (message) {
            // Vérifie si réaction déjà présente
            let reaction = message.reactions.find(r => FromB64ToUtf8(r.emoji) === emoji && r.users === this.ctx.address);
            if(reaction){
                console.warn("Vous avez déjà réagi avec cet emoji :", emoji);
                return
            }
            message.reactions.push({
                emoji: FromUtf8ToB64(emoji),
                users: this.ctx.address
            });
            this.eventBus.emit("messages:updated", {
                threadId: this.thread.id,
                messages: this.thread.messages,
            });
        } else {
            console.warn("Message not found for reaction:", messageId);
        }


        this.writeService.addReactionToMessage(groupGraphID, threadID, messageId, emoji)
            .catch((err) => {
                console.error("Erreur lors de l'ajout de la réaction :", err);
                alert("Erreur lors de l'ajout de la réaction");
            });
    }


    replyToMessage(messageId) {
        this.currentReplyToId = messageId;
        const message = this.thread.messages.find(m => m.id === messageId);
        if (message) {
            const replyPreview = this.container.querySelector('#reply-preview');
            const replyContent = this.container.querySelector('#reply-preview-content');
            replyContent.textContent = `${this.ctx.users[message.author]?.name || message.author}: ${message.content}`;
            replyPreview.classList.remove('hidden');
        }
    }

    showReactionsModal(message) {
        const list = document.getElementById("modal-reactions-list");
        list.innerHTML = "";
        if (!message.reactions || message.reactions.length === 0) {
            list.innerHTML = "<li class='text-slate-500 text-sm'>Aucune réaction</li>";
        } else {
            message.reactions.forEach(r => {
                const user = this.ctx.users[r.users] || { name: r.users, avatar: "" };
                const li = document.createElement("li");
                li.className = "flex items-center gap-3";
                li.innerHTML = `
                <span>${convertHtmlCodesToAccents(FromB64ToUtf8(r.emoji))}</span>
                <span class="text-sm text-gray-300">${user.name || r.users}</span>
            `;
                list.appendChild(li);
            });
        }
        document.getElementById("modal-reactions").classList.remove("hidden");
    }


    sendMessage() {
        const input = this.container.querySelector('#msg-input');
        const content = input.value.trim();
        if (!content) return;

        const group = this.ctx.findGroupByThreadId(this.thread.id);
        if (!group) {
            console.error("Impossible de trouver le groupe pour ce thread");
            return;
        }

        let groupGraphID = group.id;
        let threadID = this.thread.threadID
        if(this.thread.type === "private"){
            groupGraphID = this.thread.graphID
            threadID = '';
        }
        input.value = '';
        input.style.height = 'auto';

        let replyTo = null;
        if (this.currentReplyToId) {
            const replyMsg = this.thread.messages.find(m => m.id === this.currentReplyToId);
            if (replyMsg) {
                replyTo = {
                    id: replyMsg.id,
                    author: replyMsg.author
                }
            }
        }
        const msg = new Message(
            Date.now().toString(),
            this.ctx.address,
            content,
            Date.now(),
            this.thread.id,
            true,
            replyTo,
        )
        this.thread.messages.push(msg)
        this.thread.lastReadTimestamp = Date.now();
        this.ctx.eventBus.emit('messages:updated', {
            threadId: this.thread.id,
            messages: this.thread.messages,
        });
        this.scrollToBottom();

        this.container.querySelector('#reply-preview').classList.add('hidden');

        this.writeService.postMessage(threadID, groupGraphID, content, this.currentReplyToId, (contractResponse) => {
            this.thread.lastReadTimestamp = Date.now();
            this.currentReplyToId = null;
            msg.id = contractResponse.nodeID
        })
            .then((res) => {
                this.scrollToBottom();
            })
            .catch((err) => {
                console.error("Erreur lors de l'envoi du message :", err);
                input.disabled = false;
                alert("Erreur lors de l'envoi : " + err);
            });
    }


    scrollToBottom() {
        const bottomAnchor = this.container.querySelector('#bottom-anchor');
        if (bottomAnchor) {
            bottomAnchor.scrollIntoView({ behavior: 'smooth' });
        }
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        const options = {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'};
        return date.toLocaleDateString('fr-FR', options);
    }
}

window.UtopixiaChat = window.UtopixiaChat || {};
window.UtopixiaChat.MessageList = MessageList;
