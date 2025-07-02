class GraphService {
    constructor(context, store){
        this.scriptID = "a3d7bd5d-8eb0-4c7c-93bb-f0b3eabe56bb"
        this.context = context;
        this.store = store;
    }
    fetchProfile(address) {
        return Wormhole.getUserProfile(address);
    }

    fetchUserGroups(eventManager, userAddress) {
        const $this = this;
        return new Promise((resolve, reject) => {
            if (!this.scriptID || !eventManager || !userAddress) {
                let missingField = [];
                if (!this.scriptID) missingField.push("scriptID");
                if (!eventManager) missingField.push("eventManager");
                if (!userAddress) missingField.push("userAddress");
                reject("fetchUserGroups: Configuration incomplète: " + missingField.join(", "));
                return;
            }

            const payload = {
                requestType: "get-groups-for-user",
                timestamp: Date.now()
            };

            const encodedPayload = btoa(JSON.stringify(payload));

            eventManager
                .sign(userAddress, encodedPayload, 0)
                .then((signedTx) => {
                    const encodedUserTx = btoa(JSON.stringify(signedTx));
                    return Wormhole.executeContract(this.scriptID, "GetGroupsForUser", { encodedUserTx });
                })
                .then((response) => {
                    if (response.status !== "ok") {
                        return reject(response.message === "user_not_found" ? "USER_NOT_FOUND" : "API_ERROR");
                    }

                    const allChildren = response.userNode.children || [];

                    const privateGroup = new Group({
                        context: $this.context,
                        id: "__private__",
                        name: "Privés",
                        isPrivate: true,
                        avatar: "🔒"
                    });

                    const selectorGroup = new Group({
                        id: "__public_selector__",
                        name: "Explorer",
                        isSelector: true,
                        avatar: "🌐"
                    });

                    const publicGroups = [];
                    const privateThreadPromises = [];

                    for (const child of allChildren) {
                        if (child.name === "private") {
                            const links = child.children || [];
                            for (const link of links) {
                                const thread = privateGroup.createPrivateThread(link.graphID, link.created_at);
                                thread.lastReadTimestamp = $this.store.getThreadLastReadTimestamp(link.graphID);

                                privateThreadPromises.push(
                                    new Promise((resolveThread) => {
                                        Blackhole.getGraph(link.graphID, "https://utopixia.com").then((g) => {
                                            thread.name = g.object.graphName || "Discussion privée";
                                            this.fetchPrivateMessagesForThread(eventManager, userAddress, thread.id)
                                                .then((messages) => {
                                                    thread.setMessages(messages);
                                                    resolveThread(thread);
                                                })
                                                .catch((err) => {
                                                    console.warn("Erreur chargement messages privés :", err);
                                                    resolveThread(thread);
                                                });
                                        });
                                    })
                                );
                            }
                        } else {
                            const publicGroup = new Group({
                                context: $this.context,
                                id: child.graphID,
                                name: child.name || "Groupe sans nom",
                                avatar: `https://i.pravatar.cc/40?u=${child.graphID}`
                            });
                            publicGroups.push(publicGroup);
                        }
                    }

                    // Étape 1 : charger les threads privés
                    Promise.all(privateThreadPromises)
                        .then(() => {
                            // Étape 2 : charger les threads des groupes publics
                            return Promise.all(
                                publicGroups.map((group) => this.fetchPublicGroupData(group))
                            );
                        })
                        .then(() => {
                            // Étape 3 : composer la liste finale des groupes
                            const groups = [privateGroup, ...publicGroups, selectorGroup];
                            resolve(groups);
                        })
                        .catch((err) => {
                            console.error("Erreur fetchUserGroups:", err);
                            reject("UNKNOWN_ERROR");
                        });
                })
                .catch((err) => {
                    console.error("Erreur fetchUserGroups:", err);
                    reject("UNKNOWN_ERROR");
                });
        });
    }

    fetchPrivateMessagesForThread(eventManager, userAddress, groupGraphID) {
        return new Promise((resolve, reject) => {

            const payload = {
                requestType: "get-messages",
                groupGraphID: groupGraphID,
                thread: MD5("//root"),
                timestamp: Date.now()
            };

            const encodedPayload = btoa(JSON.stringify(payload));

            eventManager
                .sign(userAddress, encodedPayload, 0)
                .then(signedTx => {
                    const encodedUserTx = btoa(JSON.stringify(signedTx));
                    return Wormhole.executeContract(
                        this.scriptID,
                        "GetMessagesForThread",
                        { encodedUserTx },
                        "https://utopixia.com"
                    );
                })
                .then(response => {
                    if (response.status !== "ok") {
                        reject(response.message || "Erreur inconnue");
                    } else {
                        const messages = (response.messages || []).map(raw => {
                            return new Message(
                                raw.id,
                                raw.author,
                                convertHtmlCodesToAccents(FromB64ToUtf8(raw.text)),
                                parseInt(raw.ts),
                                groupGraphID,
                                true,
                                raw["respond-to"] ? raw["respond-to"] : null,
                                raw["reactions"],
                            );
                        });
                        resolve(messages)
                    }
                })
                .catch(err => {
                    console.error("Erreur GraphService.fetchPrivateMessagesForThread:", err);
                    reject(err);
                });
        });
    }

    fetchPublicGroupData(group) {
        const $this = this;
        const groupId = group.id;
        return new Promise((resolve, reject) => {
            Blackhole.getGraph(groupId, "https://utopixia.com").then((g) => {
                group.name = g.object.graphName || "Groupe sans nom";
                group.avatar = `https://utopixia.com${g.object['group-icon']}` || `https://i.pravatar.cc/40?u=${groupId}`;
                group.owner = g.object['group-owner']
                const threads = g.children().filter((d) => {
                    let users = []
                    if(d.object['thread-authorized_users']){
                        users = d.object['thread-authorized_users'].split(";").filter(u => u && u.length > 0)
                    }

                    return (
                        users.length === 0 ||
                        users.includes(this.context.address)
                    );
                }).map((d) => {
                    const threadId = groupId + "_" + d.object.id
                    const publicThread = group.createPublicThread(threadId, groupId, d.object.id, d.object['thread-name'], d.object['created_at'])
                    publicThread.lastReadTimestamp = $this.store.getThreadLastReadTimestamp(threadId)
                    let users = []
                    if(d.object['thread-authorized_users']){
                        users = d.object['thread-authorized_users'].split(";").filter(u => u && u.length > 0)
                    }
                    publicThread.authorizedUsers = users
                    const messages = (d.object.children || []).map(raw => {
                        let replyTo = null
                        if(raw["respond-to"]){
                            const targetNode = g.findByID(raw["respond-to"])
                            replyTo = {
                                id: targetNode.object.id,
                                author: targetNode.object['msg-author']
                            }
                        }
                        let reactions = []
                        //
                        if(raw.children && raw.children.length > 0){
                            reactions = raw.children.map(r => {
                                return {
                                    emoji: r['reaction-emoji'],
                                    users: r['reaction-author'] || []
                                }
                            })
                        }
                        return new Message(
                            raw.id,
                            raw["msg-author"],
                            convertHtmlCodesToAccents(FromB64ToUtf8(raw["msg-content"])),
                            parseInt(raw["msg-timestamp"]),
                            raw.id,
                            false,
                            replyTo,
                            reactions,
                        )
                    })
                    publicThread.setMessages(messages);
                    return publicThread
                })
                resolve(threads);
            })
        });
    }
}