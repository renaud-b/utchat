class Group {
    constructor({ context, id, name, avatar, isPrivate, isSelector, owner }) {
        this.id = id;
        this.ctx = context;
        this.name = name;
        this.avatar = avatar;
        this.isPrivate = isPrivate || false;
        this.isSelector = isSelector || false;
        this.threads = [];
        this.owner = owner;
    }
    static deserialize(data, ctx) {
        const group = new Group({
            context: ctx,
            id: data.id,
            name: data.name,
            avatar: data.avatar,
            isPrivate: data.isPrivate,
            isSelector: data.isSelector,
            owner: data.owner || null,
        });
        if (data.threads && Array.isArray(data.threads)) {
            const threads = data.threads
                .map((t) => AbstractThread.deserialize(t, ctx))
                .filter((t) => {
                    return (
                        t.type === "private" ||
                        t.authorizedUsers.length === 0 ||
                        t.authorizedUsers.includes(ctx.address)
                    );
                });
            group.addThreads(threads);
        }
        return group;
    }
    serialize() {
        return {
            id: this.id,
            name: this.name,
            avatar: this.avatar,
            isPrivate: this.isPrivate,
            isSelector: this.isSelector,
            threads: this.threads
                .filter((t) => {
                    return (
                        t.type === "private" ||
                        t.authorizedUsers.length === 0 ||
                        t.authorizedUsers.includes(this.ctx.address)
                    );
                })
                .map((t) => t.serialize()),
            owner: this.owner ? this.owner : null,
        };
    }
    createPrivateThread(graphID, createdAt) {
        const thread = new PrivateThread(this.ctx, graphID, createdAt);
        this.addThread(thread);
        return thread;
    }
    createPublicThread(id, graphID, threadID, name, createdAt = null) {
        const thread = new PublicThread(
            this.ctx,
            id,
            graphID,
            threadID,
            name,
            createdAt
        );
        this.addThread(thread);
        return thread;
    }
    addThreads(threads) {
        threads.filter((thread) => {
            if (this.threads.find((t) => t.id === thread.id)) {
                console.warn(`Thread ${thread.id} already exists in group ${this.id}`);
                return false;
            }
            return true;
        });
        this.threads.push(...threads);
    }
    addThread(thread) {
        if (
            this.threads.some((t) => {
                return t.id === thread.id;
            })
        ) {
            console.warn(`Thread ${thread.id} already exists in group ${this.id}`);
            return;
        }
        this.threads.push(thread);
    }
}
