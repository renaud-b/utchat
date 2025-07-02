class Message {
    constructor(id, author, content, timestamp, threadId, encrypted = false, replyTo = null, reactions = [] ) {
        this.id = id;
        this.author = author;
        this.content = content;
        this.timestamp = timestamp;
        this.threadId = threadId;
        this.encrypted = encrypted;
        this.reactions = reactions;
        this.replyTo = replyTo;
    }

    serialize() {
        return {
            id: this.id,
            author: this.author,
            content: this.content,
            timestamp: this.timestamp,
            threadId: this.threadId,
            encrypted: this.encrypted,
            replyTo: this.replyTo,
            reactions: this.reactions
        };
    }
    static deserialize(data) {
        return new Message(
            data.id,
            data.author,
            data.content,
            data.timestamp,
            data.threadId,
            data.encrypted,
            data.replyTo || null,
        data.reactions || []

    );
    }
}
