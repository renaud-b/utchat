class LocalStoreService {
    constructor(address) {
        this.store = window.localStorage;
        this.address = address
    }

    removeAll() {
        const keysToRemove = [];
        for (let i = 0; i < this.store.length; i++) {
            const key = this.store.key(i);
            if (key.startsWith(`${this.address}:`)) {
                keysToRemove.push(key);
            }
        }
        console.log("remove all keys: ", keysToRemove)
        keysToRemove.forEach(key => this.store.removeItem(key));
    }
    saveGroupId(groupId) {
        if(groupId === null){
            this.store.removeItem(`groupId:${this.address}`);
            return;
        }
        this.store.setItem(`groupId:${this.address}`, groupId);
    }

    loadGroupId() {
        const data = this.store.getItem(`groupId:${this.address}`);
        return data ? data : null;
    }
    saveUsers(users) {
        this.store.setItem(`users:${this.address}`, JSON.stringify(users));
    }
    saveUser(user) {
        const users = this.loadUsers() || {};
        users[user.address] = user;
        this.store.setItem(`users:${this.address}`, JSON.stringify(users));
    }

    loadUsers() {
        const data = this.store.getItem(`users:${this.address}`);
        if(data){
            return JSON.parse(data);
        }
        return null;
    }

    saveGroups(groups) {
        this.store.setItem(`groups:${this.address}`, JSON.stringify(groups));
    }

    saveThreadLastReadTimestamp(threadId, timestamp) {
        this.store.setItem(`threadLastRead:${this.address}:${threadId}`, timestamp);
    }

    getThreadLastReadTimestamp(threadId) {
        const data = this.store.getItem(`threadLastRead:${this.address}:${threadId}`);
        return data ? parseInt(data) : null;
    }

    saveThreadId(threadId) {
        if(threadId === null){
            this.store.removeItem(`threadId:${this.address}`);
            return;
        }
        this.store.setItem(`threadId:${this.address}`, threadId);
    }

    loadThreadId() {
        const data = this.store.getItem(`threadId:${this.address}`);
        return data ? data : null;
    }

    loadGroups() {
        const data = this.store.getItem(`groups:${this.address}`);
        if(data){
            return JSON.parse(data);
        }
        return null
    }

    saveProfile(profile) {
        this.store.setItem(`profile:${profile.address}`, JSON.stringify(profile));
    }

     loadProfile(address) {
        const data = this.store.getItem(`profile:${address}`);
        return data ? JSON.parse(data) : null;
    }
}