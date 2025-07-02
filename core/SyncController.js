const UserDataGraphID = "b0586e65-e103-4f36-b644-574254a113d7"

class SyncController {
    constructor(graphService, store, eventManager, context, eventBus) {
        this.graphService = graphService;
        this.context = context;
        this.store = store;
        this.eventBus = eventBus;
        this.eventManager = eventManager
        this.isSyncing = false;
        this.userProfileID = null

        Wormhole.getUserProfile(this.context.address).then((profile) => {
            this.userProfileID = profile.graphID
            this.context.profile = profile
        })
    }

    start() {
        if (this.isSyncing) return;
        const $this = this
        new BlockchainObserver((tx) => {
            if(tx.data.startsWith("urn:pi:graph:snap:"+UserDataGraphID) || tx.data.startsWith("urn:pi:graph:action:"+UserDataGraphID)){
                this.graphService.fetchUserGroups(this.eventManager, this.context.address).then((groups) => {
                    const newGroupHash = MD5(groups.map(g => g.serialize()).join(''));
                    if (newGroupHash !== this.context.groupHash) {
                        this.context.setGroups(groups);
                        this.store.saveGroups(groups.map(g => g.serialize()));
                        this.eventBus.emit("groups:updated", groups);
                    }
                })


                return
            }
            if(tx.data.startsWith("urn:pi:graph:action:"+this.userProfileID)){
                Wormhole.getUserProfile(this.context.address).then((profile) => {
                    this.context.profile = profile;
                    this.eventBus.emit("profile:updated", profile);
                })
                return;
            }
            const threadList = this.context.getAllThreads()
            threadList.forEach((thread) => {
                if (thread.type === "private") {
                    if (tx.data.indexOf("urn:pi:graph:snap:" + thread.id) !== -1 || tx.data.indexOf("urn:pi:graph:action:" + thread.id) !== -1) {
                        $this.graphService.fetchPrivateMessagesForThread($this.eventManager, $this.context.address, thread.id).then((messages) => {
                            thread.messages = messages;
                            $this.context.updateThread("__private__", thread)
                            $this.store.saveGroups($this.context.groups.map(g => g.serialize()))
                            $this.eventBus.emit("messages:updated", {
                                threadId: thread.id,
                                messages: messages
                            })
                        })
                    }
                } else {
                    if (tx.data.indexOf("urn:pi:graph:snap:" + thread.graphID) !== -1 || tx.data.indexOf("urn:pi:graph:action:" + thread.graphID) !== -1) {
                        Blackhole.getGraph(thread.graphID, "https://utopixia.com").then((graph) => {
                            const threadNodes = graph.children()
                            const threadNode = threadNodes.find(n => n.object.id === thread.threadID);
                            if (!threadNode) {
                                console.warn("Thread node not found in graph:", thread.graphID);
                                return;
                            }
                            //if(threadNode.children().length !== thread.messages.length){
                                const messages = (threadNode.object.children || []).map(raw => {
                                    return new Message(
                                        raw.id,
                                        raw["msg-author"],
                                        convertHtmlCodesToAccents(FromB64ToUtf8(raw["msg-content"])),
                                        parseInt(raw["msg-timestamp"]),
                                        raw.id,
                                        false,
                                        raw["respond-to"] ? {
                                            id: raw["respond-to"],
                                            author: graph.findByID(raw["respond-to"]).object["msg-author"]
                                        } : null,
                                        raw.children ? raw.children.map((r) => {
                                            return {
                                                emoji: r['reaction-emoji'],
                                                users: r['reaction-author'] || []
                                            }
                                        }) : []
                                    )
                                })
                                thread.setMessages(messages);
                                $this.context.updateThread(thread.id, thread)
                                $this.store.saveGroups($this.context.groups.map(g => g.serialize()))
                                $this.eventBus.emit("messages:updated", {
                                    threadId: thread.id,
                                    messages: messages
                                })
                        })
                    }
                }
            })
        }, 5000)
    }
}