const GroupGraphID = "048d5c2d-85b6-4d5a-a994-249f6032ec3a";
const UsersGraphID = "b0586e65-e103-4f36-b644-574254a113d7";
const MessagesGraphID = "84d09c9b-387b-4430-8e8f-23c4304b59b3";
const ProjectManagerAddress = "1MYmUX2E4s3uog5443j7bFLR3Enx63bHgU";
function AddReactionToMessage(encodedUserTx) {
    return safeErrorWrapper(() => {
        const userTx = parseEncodedUserTx(encodedUserTx);
        const payload = parsePayload(userTx);
        checkRequestType(payload, "add-reaction-to-message");
        checkTxTimestamp(payload);
        const sender = userTx.sender_blockchain_address;
        checkRequiredParam(payload, "groupGraphID");
        checkRequiredParam(payload, "messageID");
        checkRequiredParam(payload, "emoji");
        const groupGraphID = payload.groupGraphID.trim();
        const messageID = payload.messageID.trim();
        const emoji = payload.emoji.trim();
        const groupGraph = new GraphElement(
            groupGraphID,
            Blackhole.LoadGraph(groupGraphID)
        );
        const messageNode = groupGraph.findByID(messageID);
        if (!messageNode) {
            throw { message: "Message introuvable", details: messageID };
        }
        const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "_");
        const nodeName = "reaction_" + sender + "_" + timestamp;
        const path = messageNode.object.path + "/" + nodeName;
        const reactionNodeID = app.MD5(path);
        Blackhole.UpdateElement(
            groupGraphID,
            messageNode.object.id,
            "children",
            nodeName
        );
        Blackhole.UpdateElement(groupGraphID, reactionNodeID, "type", "reaction");
        Blackhole.UpdateElement(
            groupGraphID,
            reactionNodeID,
            "reaction-author",
            sender
        );
        Blackhole.UpdateElement(
            groupGraphID,
            reactionNodeID,
            "reaction-emoji",
            emoji
        );
        Blackhole.UpdateElement(
            groupGraphID,
            reactionNodeID,
            "reaction-timestamp",
            Date.now()
        );
        return JSON.stringify({
            status: "ok",
            reactionNodeID: reactionNodeID,
            tx: Blackhole.Commit(),
        });
    });
}
function CreatePrivateConversation(encodedUserTx) {
    return safeErrorWrapper(() => {
        const userTx = parseEncodedUserTx(encodedUserTx);
        const payload = parsePayload(userTx);
        checkRequestType(payload, "create-private-conversation");
        checkTxTimestamp(payload);
        const sender = userTx.sender_blockchain_address;
        checkRequiredParam(payload, "participants");
        const participants = payload.participants;
        if (!Array.isArray(participants) || participants.length < 2) {
            throw { message: "Il faut au moins 2 participants" };
        }
        if (!participants.includes(sender)) {
            throw { message: "Le créateur doit être dans la liste des participants" };
        }
        const sortedParticipants = [...participants].sort();
        const conversationTitle = sortedParticipants
            .map((address) => {
                const userProfileGraphInfo = Wormhole.GetUserProfile(address);
                const userGraph = new GraphElement(
                    userProfileGraphInfo.graphID,
                    userProfileGraphInfo.graph
                );
                return userGraph.object.graphName;
            })
            .join(", ");
        const rootNode = app.MD5("//root");
        const privateGraphID = app.NewUUID();
        Blackhole.NewGraph(privateGraphID);
        app.Log("create graph " + privateGraphID);
        Blackhole.UpdateElement(
            privateGraphID,
            rootNode,
            "graphName",
            conversationTitle
        );
        Blackhole.UpdateElement(
            privateGraphID,
            rootNode,
            "type",
            "private-conversation-root"
        );
        Blackhole.UpdateElement(privateGraphID, rootNode, "created_at", Date.now());
        Blackhole.UpdateElement(
            privateGraphID,
            rootNode,
            "participants",
            sortedParticipants.join(";")
        );
        Blackhole.UpdateElement(
            privateGraphID,
            rootNode,
            "group-owner",
            sortedParticipants.join(";")
        );
        const keyID = Paradox.CreateKey();
        if (keyID === undefined) {
            throw { message: "Cannot create a new key" };
        }
        Blackhole.UpdateElement(privateGraphID, rootNode, "keyID", keyID);
        const usersGraph = new GraphElement(
            UsersGraphID,
            Blackhole.LoadGraph(UsersGraphID)
        );
        const userNodeIDs = {};
        const privateNodeIDs = {};
        const addedNodes = [];
        participants.forEach((participantAddress) => {
            if (!usersGraph.hasNext(participantAddress)) {
                throw {
                    message: "Utilisateur non trouvé",
                    details: participantAddress,
                };
            }
            const userNode = usersGraph.next(participantAddress);
            userNodeIDs[participantAddress] = userNode.object.id;
            let privateNodeID;
            let privateNodePath;
            if (!userNode.hasNext("private")) {
                privateNodeID = createPrivateNodeForUser(userNode, Date.now());
                privateNodeIDs[participantAddress] = privateNodeID;
            } else {
                const privateNode = userNode.next("private");
                privateNodePath = privateNode.object.path;
                privateNodeID = privateNode.object.id;
                privateNodeIDs[participantAddress] = privateNodeID;
            }
            const path = privateNodePath + "/" + privateGraphID;
            const convNodeID = app.MD5(path);
            Blackhole.UpdateElement(
                UsersGraphID,
                privateNodeID,
                "children",
                privateGraphID
            );
            Blackhole.UpdateElement(
                UsersGraphID,
                convNodeID,
                "type",
                "private-conversation-link"
            );
            Blackhole.UpdateElement(
                UsersGraphID,
                convNodeID,
                "graphID",
                privateGraphID
            );
            Blackhole.UpdateElement(
                UsersGraphID,
                convNodeID,
                "created_at",
                Date.now()
            );
            addedNodes.push({
                participant: participantAddress,
                privateNodeID: privateNodeID,
                conversationNodeID: convNodeID,
            });
        });
        return {
            status: "ok",
            privateGraphID: privateGraphID,
            conversationTitle: conversationTitle,
            participants: sortedParticipants,
            addedNodes: addedNodes,
            tx: Blackhole.Commit(),
        };
    });
}
function JoinGroup(encodedUserTx) {
    return safeErrorWrapper(() => {
        const userTx = parseEncodedUserTx(encodedUserTx);
        const payload = parsePayload(userTx);
        checkRequestType(payload, "join-group");
        checkTxTimestamp(payload);
        const sender = userTx.sender_blockchain_address;
        checkRequiredParam(payload, "groupGraphID");
        const groupGraphID = payload.groupGraphID.trim();
        const usersGraph = new GraphElement(
            UsersGraphID,
            Blackhole.LoadGraph(UsersGraphID)
        );
        if (!usersGraph.hasNext(sender)) {
            throw { message: "user_not_found", details: sender };
        }
        const userNode = usersGraph.next(sender);
        if (userNode.hasNext(groupGraphID)) {
            return { status: "already_joined", groupGraphID: groupGraphID };
        }
        const path = userNode.object.path + "/" + groupGraphID;
        const nodeID = app.MD5(path);
        Blackhole.UpdateElement(
            UsersGraphID,
            userNode.object.id,
            "children",
            groupGraphID
        );
        Blackhole.UpdateElement(UsersGraphID, nodeID, "graphID", groupGraphID);
        Blackhole.UpdateElement(UsersGraphID, nodeID, "type", "joined-group");
        Blackhole.UpdateElement(UsersGraphID, nodeID, "joined_at", Date.now());
        return {
            status: "ok",
            groupGraphID: groupGraphID,
            userNodeID: userNode.object.id,
            groupLinkNodeID: nodeID,
            tx: Blackhole.Commit(),
        };
    });
}
function LeaveGroup(encodedUserTx) {
    return safeErrorWrapper(() => {
        const userTx = parseEncodedUserTx(encodedUserTx);
        const payload = parsePayload(userTx);
        checkRequestType(payload, "leave-group");
        checkTxTimestamp(payload);
        const sender = userTx.sender_blockchain_address;
        checkRequiredParam(payload, "groupGraphID");
        const groupGraphID = payload.groupGraphID.trim();
        const usersGraph = new GraphElement(
            UsersGraphID,
            Blackhole.LoadGraph(UsersGraphID)
        );
        if (!usersGraph.hasNext(sender)) {
            throw { message: "user_not_found", details: sender };
        }
        const userNode = usersGraph.next(sender);
        if (!userNode.hasNext(groupGraphID)) {
            return { status: "not_joined", groupGraphID: groupGraphID };
        }
        const groupNode = userNode.next(groupGraphID);
        Blackhole.DeleteElement(UsersGraphID, groupNode.object.id);
        return {
            status: "ok",
            groupGraphID: groupGraphID,
            userNodeID: userNode.object.id,
            deletedNodeID: groupNode.object.id,
            tx: Blackhole.Commit(),
        };
    });
}
function GetMessagesForThread(encodedUserTx) {
    Wormhole.SetOutputFormat("application/json");
    let userTx;
    try {
        userTx = JSON.parse(atob(encodedUserTx));
    } catch (err) {
        return sendError("Transaction illisible", err.message);
    }
    if (!Singularity.IsValidTransaction(userTx)) {
        return sendError("Transaction invalide");
    }
    const sender = userTx.sender_blockchain_address;
    let payload;
    try {
        payload = JSON.parse(atob(userTx.data));
    } catch (err) {
        return sendError("Payload illisible", err.message);
    }
    if (payload.requestType !== "get-messages") {
        return sendError("Type de requête invalide", payload.requestType);
    }
    const now = Date.now();
    if (Math.abs(now - payload.timestamp) > 5000) {
        return sendError("Timestamp invalide", {
            now,
            received: payload.timestamp,
        });
    }
    try {
        checkRequiredParam(payload, "groupGraphID");
    } catch (err) {
        return sendError("missing field groupGraphID", err.message);
    }
    const groupGraphID = payload.groupGraphID.trim();
    const threadID = payload.thread;
    const graph = new GraphElement(
        groupGraphID,
        Blackhole.LoadGraph(groupGraphID)
    );
    let threadNode = graph.findByID(threadID);
    if (graph.object.id == threadID) {
        threadNode = graph;
    }
    if (!threadNode) {
        return sendError("Thread introuvable", threadID);
    }
    try {
        checkUserAuthorized(
            sender,
            threadNode.object["thread-authorized_users"] || ""
        );
    } catch (e) {
        return sendError("Accès refusé pour cet utilisateur", sender);
    }
    const keyID = threadNode.object["keyID"];
    const previousMsg = {};
    const messages = threadNode.children().map((msg) => {
        let text = msg.object["msg-content"];
        if (keyID) {
            text = Paradox.Decrypt(groupGraphID, msg.object.id, "msg-content");
        }
        const entry = {
            id: msg.object.id,
            author: msg.object["msg-author"],
            text: text,
            ts: msg.object["msg-timestamp"],
        };
        if (msg.object["respond-to"] !== undefined) {
            const srcMsg = previousMsg[msg.object["respond-to"]];
            if (srcMsg) {
                entry["respond-to"] = {
                    id: srcMsg.id,
                    author: srcMsg.author,
                    text: srcMsg.text,
                    ts: srcMsg.ts,
                };
            }
        }
        const reactions = msg
            .children()
            .map((child) => {
                if (child.object.type !== "reaction") {
                    return null;
                }
                return {
                    author: child.object["reaction-author"],
                    emoji: child.object["reaction-emoji"],
                    timestamp: child.object["reaction-timestamp"],
                };
            })
            .filter((e) => e !== null);
        if (reactions.length > 0) {
            entry["reactions"] = reactions;
        }
        previousMsg[msg.object.id] = entry;
        return entry;
    });
    return JSON.stringify({ status: "ok", messages: messages });
}
function RenamePrivateThread(encodedUserTx) {
    return safeErrorWrapper(() => {
        const userTx = parseEncodedUserTx(encodedUserTx);
        const payload = parsePayload(userTx);
        checkRequestType(payload, "rename-private-thread");
        checkTxTimestamp(payload);
        checkRequiredParam(payload, "name");
        checkRequiredParam(payload, "graphID");
        const graphID = payload.graphID;
        const threadName = payload.name;
        const graph = new GraphElement(graphID, Blackhole.LoadGraph(graphID));
        if (!graph.isValid()) {
            throw { message: "Thread introuvable", details: graphID };
        }
        Blackhole.UpdateElement(graphID, graph.object.id, "graphName", threadName);
        return JSON.stringify({
            status: "ok",
            tx: Blackhole.Commit(userTx.sender_blockchain_address),
        });
    });
}
function PostMessage(encodedUserTx) {
    return safeErrorWrapper(() => {
        const userTx = parseEncodedUserTx(encodedUserTx);
        const payload = parsePayload(userTx);
        checkRequestType(payload, "post-message");
        checkTxTimestamp(payload);
        const sender = userTx.sender_blockchain_address;
        checkRequiredParam(payload, "content");
        checkRequiredParam(payload, "groupGraphID");
        const threadID = payload.thread;
        const content = payload.content;
        const groupGraphID = payload.groupGraphID;
        const graph = new GraphElement(
            groupGraphID,
            Blackhole.LoadGraph(groupGraphID)
        );
        let threadNode = graph;
        if (threadID && threadID.length > 0) {
            threadNode = graph.findByID(threadID);
            if (!threadNode) {
                throw { message: "Thread introuvable", details: threadID };
            }
        }
        checkUserAuthorized(
            sender,
            threadNode.object["thread-authorized_users"] || ""
        );
        const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "_");
        const nodeName = "msg_" + timestamp;
        const path = threadNode.object.path + "/" + nodeName;
        const nodeID = app.MD5(path);
        Blackhole.UpdateElement(
            groupGraphID,
            threadNode.object.id,
            "children",
            nodeName
        );
        Blackhole.UpdateElement(groupGraphID, nodeID, "msg-author", sender);
        if (payload["respond-to"] && payload["respond-to"].length > 0) {
            Blackhole.UpdateElement(
                groupGraphID,
                nodeID,
                "respond-to",
                payload["respond-to"]
            );
        }
        const keyID = threadNode.object["keyID"];
        if (keyID !== undefined) {
            Paradox.EncryptWithKey(
                keyID,
                groupGraphID,
                nodeID,
                "msg-content",
                content,
                "1LeSt2xeS221VgUHxiQT7KGZzpjpNxzQXc"
            );
        } else {
            Blackhole.UpdateElement(groupGraphID, nodeID, "msg-content", content);
        }
        Blackhole.UpdateElement(groupGraphID, nodeID, "msg-timestamp", Date.now());
        return JSON.stringify({
            status: "ok",
            nodeID: nodeID,
            tx: Blackhole.Commit(sender),
        });
    });
}
function CreateThread(encodedUserTx) {
    return safeErrorWrapper(() => {
        const userTx = parseEncodedUserTx(encodedUserTx);
        const payload = parsePayload(userTx);
        checkRequestType(payload, "create-thread");
        checkTxTimestamp(payload);
        const sender = userTx.sender_blockchain_address;
        checkRequiredParam(payload, "name");
        checkRequiredParam(payload, "groupGraphID");
        const name = payload.name.trim();
        if (name.length <= 0) {
            throw { message: "Nom de thread invalide" };
        }
        const groupGraphID = payload.groupGraphID.trim();
        checkSenderIsPMOrGroupOwner(sender, groupGraphID);
        const root = new GraphElement(
            groupGraphID,
            Blackhole.LoadGraph(groupGraphID)
        );
        const path = root.object.path + "/" + name;
        const nodeID = app.MD5(path);
        Blackhole.UpdateElement(groupGraphID, root.object.id, "children", name);
        Blackhole.UpdateElement(groupGraphID, nodeID, "type", "thread");
        Blackhole.UpdateElement(groupGraphID, nodeID, "thread-name", name);
        Blackhole.UpdateElement(
            groupGraphID,
            nodeID,
            "thread-authorized_users",
            sender + ";"
        );
        Blackhole.UpdateElement(groupGraphID, nodeID, "created_at", Date.now());
        return JSON.stringify({
            status: "ok",
            nodeID: nodeID,
            tx: Blackhole.Commit(),
        });
    });
}
function EditThread(encodedUserTx) {
    return safeErrorWrapper(() => {
        const userTx = parseEncodedUserTx(encodedUserTx);
        const payload = parsePayload(userTx);
        checkRequestType(payload, "edit-thread");
        checkTxTimestamp(payload);
        const sender = userTx.sender_blockchain_address;
        checkRequiredParam(payload, "thread");
        checkRequiredParam(payload, "newName");
        checkRequiredParam(payload, "authorized");
        checkRequiredParam(payload, "groupGraphID");
        const threadID = payload.thread;
        const newName = payload.newName.trim();
        const newUsers = payload.authorized.trim();
        const groupGraphID = payload.groupGraphID.trim();
        const graph = new GraphElement(
            groupGraphID,
            Blackhole.LoadGraph(groupGraphID)
        );
        const thread = graph.findByID(threadID);
        if (!thread) {
            throw { message: "Thread introuvable", details: threadID };
        }
        checkSenderIsPMOrGroupOwner(sender, groupGraphID);
        Blackhole.UpdateElement(groupGraphID, threadID, "thread-name", newName);
        if (newUsers === ";") {
            Blackhole.UpdateElement(
                groupGraphID,
                threadID,
                "thread-authorized_users",
                ""
            );
        } else {
            Blackhole.UpdateElement(
                groupGraphID,
                threadID,
                "thread-authorized_users",
                newUsers
            );
        }
        return JSON.stringify({ status: "ok", tx: Blackhole.Commit() });
    });
}
function DeleteThread(encodedUserTx) {
    return safeErrorWrapper(() => {
        const userTx = parseEncodedUserTx(encodedUserTx);
        const payload = parsePayload(userTx);
        checkRequestType(payload, "delete-thread");
        checkTxTimestamp(payload);
        const sender = userTx.sender_blockchain_address;
        checkRequiredParam(payload, "groupGraphID");
        const groupGraphID = payload.groupGraphID.trim();
        const threadID = payload.thread;
        if (!threadID) {
            throw { message: "Thread manquant" };
        }
        const graph = new GraphElement(
            groupGraphID,
            Blackhole.LoadGraph(groupGraphID)
        );
        const thread = graph.findByID(threadID);
        if (!thread) {
            throw { message: "Thread introuvable", details: threadID };
        }
        checkSenderIsPMOrGroupOwner(sender, groupGraphID);
        Blackhole.DeleteElement(groupGraphID, threadID);
        return JSON.stringify({ status: "ok", tx: Blackhole.Commit() });
    });
}
function RegisterUser(encodedUserTx) {
    return safeErrorWrapper(() => {
        const userTx = parseEncodedUserTx(encodedUserTx);
        const payload = parsePayload(userTx);
        checkRequestType(payload, "register-user");
        checkTxTimestamp(payload);
        const sender = userTx.sender_blockchain_address;
        const now = Date.now();
        const root = new GraphElement(
            UsersGraphID,
            Blackhole.LoadGraph(UsersGraphID)
        );
        if (root.hasNext(sender)) {
            const userNode = root.next(sender);
            if (!userNode.hasNext("private")) {
                const privateNodeID = createPrivateNodeForUser(userNode, now);
                return {
                    status: "no_private_found",
                    userNodeID: userNode.id,
                    privateNodeID: privateNodeID,
                    tx: Blackhole.Commit(),
                };
            } else {
                return {
                    status: "user_already_exists",
                    userNodeID: userNode.id,
                    privateNodeID: userNode.next("private").id,
                };
            }
        }
        const userNodeID = createUserNode(root, sender, now);
        const privateNodeID = createPrivateNodeForUserID(userNodeID, sender, now);
        return {
            status: "ok",
            userNodeID: userNodeID,
            privateNodeID: privateNodeID,
            tx: Blackhole.Commit(),
        };
    });
}
function GetGroupsForUser(encodedUserTx) {
    return safeErrorWrapper(() => {
        const userTx = parseEncodedUserTx(encodedUserTx);
        const payload = parsePayload(userTx);
        checkRequestType(payload, "get-groups-for-user");
        checkTxTimestamp(payload);
        const sender = userTx.sender_blockchain_address;
        const root = new GraphElement(
            UsersGraphID,
            Blackhole.LoadGraph(UsersGraphID)
        );
        if (!root.hasNext(sender)) {
            throw { message: "user_not_found", details: sender };
        }
        const userNode = root.next(sender);
        return { status: "ok", userNode: userNode.object };
    });
}
function checkSenderIsPM(sender) {
    if (sender !== ProjectManagerAddress) {
        throw { message: "Seul le PM peut effectuer cette opération" };
    }
}
function checkTxTimestamp(payload, toleranceMs = 5000) {
    const now = Date.now();
    if (Math.abs(now - payload.timestamp) > toleranceMs) {
        throw {
            message: "Timestamp invalide",
            details: { now, received: payload.timestamp },
        };
    }
}
function checkRequestType(payload, expectedType) {
    if (payload.requestType !== expectedType) {
        throw {
            message: "Type de requête invalide",
            details: { expected: expectedType, received: payload.requestType },
        };
    }
}
function parseEncodedUserTx(encodedUserTx) {
    let userTx;
    try {
        userTx = JSON.parse(atob(encodedUserTx));
    } catch (err) {
        throw { message: "Transaction illisible", details: err.message };
    }
    if (!Singularity.IsValidTransaction(userTx)) {
        throw { message: "Transaction invalide" };
    }
    return userTx;
}
function parsePayload(userTx) {
    let payload;
    try {
        payload = JSON.parse(atob(userTx.data));
    } catch (err) {
        throw { message: "Payload illisible", details: err.message };
    }
    return payload;
}
function safeErrorWrapper(func) {
    try {
        Wormhole.SetOutputFormat("application/json");
        return func();
    } catch (err) {
        return sendError(err.message || "Erreur inconnue", err.details || null);
    }
}
function createPrivateNodeForUser(userNode, now) {
    const privatePath = userNode.object.path + "/private";
    const privateNodeID = app.MD5(privatePath);
    Blackhole.UpdateElement(UsersGraphID, userNode.id, "children", "private");
    Blackhole.UpdateElement(
        UsersGraphID,
        privateNodeID,
        "type",
        "private-conversations-root"
    );
    Blackhole.UpdateElement(UsersGraphID, privateNodeID, "created_at", now);
    return privateNodeID;
}
function createUserNode(root, sender, now) {
    const userPath = root.object.path + "/" + sender;
    const userNodeID = app.MD5(userPath);
    Blackhole.UpdateElement(UsersGraphID, root.object.id, "children", sender);
    Blackhole.UpdateElement(
        UsersGraphID,
        userNodeID,
        "type",
        "user-private-root"
    );
    Blackhole.UpdateElement(UsersGraphID, userNodeID, "user-address", sender);
    Blackhole.UpdateElement(UsersGraphID, userNodeID, "created_at", now);
    return userNodeID;
}
function createPrivateNodeForUserID(userNodeID, sender, now) {
    const privatePath = UsersGraphID + "/" + sender + "/private";
    const privateNodeID = app.MD5(privatePath);
    Blackhole.UpdateElement(UsersGraphID, userNodeID, "children", "private");
    Blackhole.UpdateElement(
        UsersGraphID,
        privateNodeID,
        "type",
        "private-conversations-root"
    );
    Blackhole.UpdateElement(UsersGraphID, privateNodeID, "created_at", now);
    return privateNodeID;
}
function checkRequiredParam(payload, paramName) {
    if (
        !payload[paramName] ||
        payload[paramName].toString().trim().length === 0
    ) {
        throw { message: "Paramètre manquant ou vide", details: paramName };
    }
}
function sendError(message, details = null) {
    return JSON.stringify({
        status: "error",
        message: message,
        details: details,
    });
}
function checkUserAuthorized(sender, authorizedString) {
    if (authorizedString == null || authorizedString.length == 0) {
        return;
    }
    if (
        !authorizedString.includes(sender + ";") &&
        sender !== ProjectManagerAddress
    ) {
        throw { message: "Accès refusé", details: sender };
    }
}
function checkSenderIsPMOrGroupOwner(sender, groupGraphID) {
    if (sender === ProjectManagerAddress) return;
    const groupGraph = new GraphElement(
        groupGraphID,
        Blackhole.LoadGraph(groupGraphID)
    );
    const groupOwner = groupGraph.object["group-owner"];
    if (sender !== groupOwner) {
        throw {
            message:
                "Seul le PM ou le owner du groupe peut effectuer cette opération",
            details: sender,
        };
    }
}
