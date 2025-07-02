class Context {
    constructor(address, store, eventBus) {
        this.address = address;
        this.store = store;
        this.profile = null;
        this.settings = {};
        this.contacts = [];
        this.users = {};
        this.groups = [];
        this.eventBus = eventBus || null;
        this.selectedThreadId = null
        // Load the current user profile
        const $this = this
        Wormhole.getUserProfile(address).then((profile) => {
            $this.users[address] = {
                name: convertHtmlCodesToAccents(profile.object.graphName), // Default to address if no name is provided
                avatar: "https://utopixia.com"+profile.object.profilePictureURL
            };
            if(!profile.hasNext("dapps")){
                return
            }
            const dapps = profile.next("dapps")
            if(!dapps.hasNext("contacts")){
                return
            }
            const contacts = dapps.next("contacts")
            Promise.all(contacts.children().map(node => {
                const contactAddress = node.object.name;
                return Wormhole.getUserProfile(contactAddress).then((contactProfile) => {
                    let avatarUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2RkZGRkZCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjIwIiBmaWxsPSIjOTk5OTk5Ii8+PHJlY3QgeT0iNjAiIHdpZHRoPSI3MCIgaGVpZ2h0PSI0MCIgeD0iMTUiIGZpbGw9IiM5OTk5OTkiIHJ4PSIxNSIvPjwvc3ZnPg==';
                    if (contactProfile.object.profilePictureURL && contactProfile.object.profilePictureURL.length > 0) {
                        avatarUrl = "https://utopixia.com" + contactProfile.object.profilePictureURL;
                    }
                    $this.contacts.push({
                        address: contactAddress,
                        name: convertHtmlCodesToAccents(contactProfile.object.graphName),
                        description: convertHtmlCodesToAccents(contactProfile.object.description || ""),
                        avatar: avatarUrl
                    });
                });
            })).then(() => {
                if ($this.eventBus) {
                    $this.eventBus.emit("contacts:loaded", $this.contacts);
                }
            });
        })
    }

    setThreadId(threadId) {
        this.selectedThreadId = threadId; // Mettre à jour l'ID du thread sélectionné
    }

    setGroups(groups) {
        this.groups = groups || [];
        console.log("set groups")
        this.eventBus.emit("groups:updated", this.groups);
    }

    addGroup(group) {
        this.groups.push(group);
        this.eventBus.emit("groups:updated", this.groups);
    }

    findGroupById(groupId) {
        return this.groups.find(group => group.id === groupId) || null;
    }

    getCurrentGroup() {
        if (this.selectedGroupId) {
            return this.findGroupById(this.selectedGroupId);
        }
        // Si aucun groupe n'est sélectionné, on retourne le premier groupe
        return this.groups.length > 0 ? this.groups[0] : null;
    }

    getCurrentThread() {
        return this.findThreadById(this.selectedThreadId);
    }

    getAllThreads() {
        const threadList = [];
        for (const group of this.groups) {
            for (const thread of group.threads) {
                threadList.push(thread);
            }
        }
        return threadList;
    }

    updateThread(groupId, thread) {
        const group = this.findGroupById(groupId);
        if (group) {
            const existingThreadIndex = group.threads.findIndex(t => t.id === thread.id);
            if (existingThreadIndex !== -1) {
                group.threads[existingThreadIndex] = thread; // Met à jour le thread existant
            } else {
                group.threads.push(thread); // Ajoute un nouveau thread
            }
            this.eventBus.emit("thread:updated", thread);
        }
    }

    findGroupByThreadId(threadId) {
        for (const group of this.groups) {
            const thread = group.threads.find((t) => {
                if(t.type === "private"){
                    return t.id === threadId || t.graphID === threadId; // Pour les threads privés, on vérifie l'ID ou le graphID
                }
                return t.id === threadId
            });
            if (thread) return group;
        }
        return null;
    }

    setGroupId(groupId) {
        this.selectedGroupId = groupId;
        if (this.eventBus) {
            this.eventBus.emit("group:updated", groupId);
        }
    }

    findThreadById(threadId) {
        for (const group of this.groups) {
            const thread = group.threads.find(t => t.id === threadId);
            if (thread) return thread;
        }
        return null;
    }

    findMessageById(messageId) {
        for (const group of this.groups) {
            for (const thread of group.threads) {
                const msg = thread.messages.find(m => m.id === messageId);
                if (msg) return msg;
            }
        }
        return null;
    }

    static getSafeProfilePicture(userObject) {
        const url= userObject["profilePictureURL"] &&
        userObject["profilePictureURL"].trim().length > 0
            ? userObject["profilePictureURL"]
            : "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2RkZGRkZCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjIwIiBmaWxsPSIjOTk5OTk5Ii8+PHJlY3QgeT0iNjAiIHdpZHRoPSI3MCIgaGVpZ2h0PSI0MCIgeD0iMTUiIGZpbGw9IiM5OTk5OTkiIHJ4PSIxNSIvPjwvc3ZnPg==";

        if(url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")){
            return url
        }
        return "https://utopixia.com" + url;
    }

}
