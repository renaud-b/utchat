class GraphWriteService {
    constructor(eventManager, userAddress) {
        this.eventManager = eventManager;
        this.userAddress = userAddress;
        this.scriptID = "a3d7bd5d-8eb0-4c7c-93bb-f0b3eabe56bb";
    }

    _signAndExecute(payload, method, onContractExecuted = () => {}) {
        return new Promise((resolve, reject) => {
            if (!this.scriptID || !this.eventManager || !this.userAddress) {
                return reject("Configuration incomplète");
            }
            const encodedPayload = btoa(JSON.stringify(payload));

            this.eventManager.sign(this.userAddress, encodedPayload, 0)
                .then(signedTx => {
                    const encodedUserTx = btoa(JSON.stringify(signedTx));
                    return Wormhole.executeContract(this.scriptID, method, { encodedUserTx }, "https://utopixia.com");
                })
                .then(response => {
                    if (response.status !== "ok") {
                        reject(response.message || response.status || "Erreur inconnue");
                    } else {
                        onContractExecuted(response)
                        Singularity.waitForTx(response.tx).then(() => resolve(response)).catch(reject);
                    }
                })
                .catch(reject);
        });
    }

    registerUser() {
        const payload = { requestType: "register-user", timestamp: Date.now() };
        return new Promise((resolve, reject) => {
            this._signAndExecute(payload, "RegisterUser", resolve).catch((err) => {
                console.log(err)
                if( err === 'user_already_exists'){
                    resolve()
                    return
                }
                reject(err)
            })
        })
    }

    createPrivateConversation(participants) {
        const payload = { requestType: "create-private-conversation", participants, timestamp: Date.now() };
        return new Promise((resolve, reject) => {
            this._signAndExecute(payload, "CreatePrivateConversation", (contractResponse) => {
                resolve(contractResponse);
            }).catch(reject)
        })
    }

    postMessage(threadID, groupGraphID, content, respondTo = null, onContractExecuted = () => {}) {
        const payload = {
            requestType: "post-message",
            thread: threadID,
            groupGraphID,
            content: convertAccentsToHtmlCodes(FromUtf8ToB64(content)),
            timestamp: Date.now()
        };
        if (respondTo) payload["respond-to"] = respondTo;
        return this._signAndExecute(payload, "PostMessage", onContractExecuted);
    }

    createThread(groupGraphID, name) {
        const payload = {
            requestType: "create-thread",
            name,
            groupGraphID,
            timestamp: Date.now()
        };
        return new Promise((resolve, reject) => {
            this._signAndExecute(payload, "CreateThread", (contractResponse) => {
                resolve(contractResponse)
            }).catch(reject)
        })
    }

    editThread(threadID, groupGraphID, newName, newAuthorizedString) {
        const payload = {
            requestType: "edit-thread",
            thread: threadID,
            newName,
            groupGraphID,
            authorized: newAuthorizedString,
            timestamp: Date.now()
        };
        return new Promise((resolve, reject) => {
            this._signAndExecute(payload, "EditThread", resolve).catch(reject)
        })
    }

    renamePrivateThread(threadID, newName) {
        const payload = {
            requestType: "rename-private-thread",
            graphID: threadID,
            name: newName,
            timestamp: Date.now()
        };
        return new Promise((resolve, reject) => {
            this._signAndExecute(payload, "RenamePrivateThread", () => {
                resolve()
            }).catch(reject)

        })
    }
    deleteThread(threadID, groupGraphID) {
        const payload = {
            requestType: "delete-thread",
            thread: threadID,
            groupGraphID,
            timestamp: Date.now()
        };
        return new Promise((resolve, reject) => {
            this._signAndExecute(payload, "DeleteThread", resolve).catch(reject)
        });
    }

    joinGroup(groupGraphID) {
        const payload = { requestType: "join-group", groupGraphID, timestamp: Date.now() };
        return this._signAndExecute(payload, "JoinGroup");
    }

    leaveGroup(groupGraphID) {
        const payload = { requestType: "leave-group", groupGraphID, timestamp: Date.now() };
        return this._signAndExecute(payload, "LeaveGroup");
    }

    addReactionToMessage(groupGraphID, threadID, messageID, emoji) {
        emoji = FromUtf8ToB64(emoji)
        const payload = {
            requestType: "add-reaction-to-message",
            groupGraphID,
            threadID,
            messageID,
            emoji,
            timestamp: Date.now()
        };
        return this._signAndExecute(payload, "AddReactionToMessage");
    }
}
