
class AbstractThread {
    constructor(context) {
        this.messages = []; // Array to hold messages in this thread
        this.context = context;
        this.lastReadTimestamp = 0;
    }

    setMessages(messages) {
        this.messages = messages;
        this.context.eventBus.emit('groups:updated', {})
        let promises = this.messages.map((msg) => {
            return new Promise((resolve, reject)=>{

                if(this.context.users[msg.author]){
                    resolve()
                    return
                }
                this.context.users[msg.author] = {}

                Wormhole.getUserProfile(msg.author).then((profile) => {
                    let avatarUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2RkZGRkZCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjIwIiBmaWxsPSIjOTk5OTk5Ii8+PHJlY3QgeT0iNjAiIHdpZHRoPSI3MCIgaGVpZ2h0PSI0MCIgeD0iMTUiIGZpbGw9IiM5OTk5OTkiIHJ4PSIxNSIvPjwvc3ZnPg=='
                    if(profile.object.profilePictureURL && profile.object.profilePictureURL.length > 0){
                        avatarUrl = "https://utopixia.com"+profile.object.profilePictureURL
                    }
                    this.context.users[msg.author] = {
                        name: convertHtmlCodesToAccents(profile.object.graphName), // Default to address if no name is provided
                        avatar: avatarUrl
                    };
                    this.context.eventBus.emit('users:updated', {
                        address: msg.author,
                        profile: this.context.users[msg.author]
                    });
                    resolve()
                })
            })
        })

        Promise.all(promises).then(() => {
          this.context.store.saveUsers(this.context.users);
        })


    }
    getLastMessage() {
        if (this.messages.length === 0) return null;
        return this.messages.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
    }

    static deserialize(data, ctx) {
        if(!data){
            return null
        }
        let thread;
        if (data.type === "public") {
            thread = new PublicThread(ctx, data.id, data.graphID, data.threadID, data.name, data.createdAt);
            thread.lastReadTimestamp = data.lastReadTimestamp || Date.now();
            thread.authorizedUsers = data.authorizedUsers || []; // Liste des utilisateurs autorisés dans le groupe
        } else if (data.type === "private") {
            thread = new PrivateThread(ctx, data.graphID, data.createdAt);
            thread.name = data.name || "Discussion privée";
            thread.lastReadTimestamp = data.lastReadTimestamp || Date.now();
            thread.id = data.id; // assure que l'ID soit bien repris
        } else {
            console.warn("Type de thread inconnu :", data.type);
            return null;
        }

        if (data.messages && Array.isArray(data.messages)) {
            const messages = data.messages.map(m => Message.deserialize(m));
            // order messages by timestamp
            messages.sort((a, b) => a.timestamp - b.timestamp);
            thread.setMessages(messages);
        }

        return thread;
    }
}

class PublicThread extends AbstractThread {
    constructor(context, id, graphID, threadID, name, createdAt = null) {
        super(context)
        this.id = id; // thread node ID
        this.graphID = graphID; // thread node ID
        this.threadID = threadID
        this.name = name;
        this.createdAt = createdAt;
        this.type = "public";
        this.authorizedUsers = []; // Utilisateurs autorisés dans le groupe
    }
    serialize() {
        return {
            id: this.id,
            graphID: this.graphID,
            threadID: this.threadID,
            name: this.name,
            createdAt: this.createdAt,
            type: this.type,
            lastReadTimestamp: this.lastReadTimestamp,
            messages: this.messages.map(m => m.serialize()),
            authorizedUsers: this.authorizedUsers // Liste des utilisateurs autorisés dans le groupe
        };
    }
}

class PrivateThread  extends AbstractThread {
    constructor(context, graphID, createdAt) {
        super(context)
        this.id = graphID;
        this.graphID = graphID;
        this.createdAt = createdAt;
        this.type = "private";
    }
    serialize() {
        return {
            id: this.id,
            graphID: this.graphID,
            threadID: this.threadID,
            name: this.name,
            createdAt: this.createdAt,
            type: this.type,
            lastReadTimestamp: this.lastReadTimestamp,
            messages: this.messages.map(m => m.serialize())
        };

    }
}
