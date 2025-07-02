class NotificationService {
    constructor(address) {
        this.address = address
    }

    isNotificationActivated(threadID) {
        return new Promise((resolve) => {
            Wormhole.getUserProfile(this.address)
                .then((userProfile) => {
                    let hasNotifActivated = false;
                    if (userProfile.hasNext("dapps")) {
                        const dapps = userProfile.next("dapps");
                        if (dapps.hasNext("notifier")) {
                            const notificationNodeID = "notif_" + threadID;
                            const notifier = dapps.next("notifier");
                            if (notifier.hasNext(notificationNodeID)) {
                                hasNotifActivated = true;
                            }
                        }
                    }
                    resolve(hasNotifActivated);
                })
                .catch(() => {
                    resolve(false);
                });
        });
    }

    updateNotificationState (eventManager, userProfileGraph, convID, graphID, isChecked = true) {
        return new Promise((resolve) => {
            const actions = this._createNewNotificationFilter(
                this.address,
                userProfileGraph,
                convID,
                graphID,
                isChecked
            );
            if (actions.length > 0) {
                const groupAction = Blackhole.Actions.makeGroup(
                    userProfileGraph.graphID,
                    ...actions
                );
                eventManager
                    .sign(this.address, groupAction, 0)
                    .then((signedTx) => {
                        Singularity.saveSignedTx(signedTx).then((response) => {
                            const txUUID = response.UUID;
                            resolve(txUUID)

                        });
                    });
            } else {
                console.log("no actions found");
            }
        })
    }

    _createNewNotificationFilter(userAddress, graph, convID, graphID, isChecked) {
        const actions = [];
        const $this = this
        function createNotification(notifierPath, notificationNodeName) {
            const notifierID = MD5(notifierPath);
            actions.push(
                Blackhole.Actions.update(notifierID, "children", notificationNodeName)
            );
            const expectedPath = notifierPath + "/" + notificationNodeName;
            const filterActions = $this.createFilterActions(
                expectedPath,
                graphID,
                userAddress
            );
            for (const lineID in filterActions) {
                actions.push(filterActions[lineID]);
            }
        }

        const notificationNodeName = "notif_" + convID;
        if (!graph.hasNext("dapps")) {
            actions.push(
                Blackhole.Actions.update(graph.object.id, "children", "dapps")
            );
            const expectedDappsPath = graph.object.path + "/dapps";
            actions.push(
                Blackhole.Actions.update(MD5(expectedDappsPath), "children", "notifier")
            );
            if (isChecked) {
                const notifierPath = expectedDappsPath + "/notifier";
                createNotification(notifierPath, notificationNodeName);
            }
        } else {
            const dapps = graph.next("dapps");
            if (!dapps.hasNext("notifier")) {
                actions.push(
                    Blackhole.Actions.update(dapps.object.id, "children", "notifier")
                );
                if (isChecked) {
                    const notifierPath = dapps.object.path + "/notifier";
                    createNotification(notifierPath, notificationNodeName);
                }
            } else {
                const notifier = dapps.next("notifier");
                if (notifier.hasNext(notificationNodeName) && !isChecked) {
                    const targetFilter = notifier.next(notificationNodeName);
                    actions.push(Blackhole.Actions.delete(targetFilter.object.id));
                } else if (!notifier.hasNext(notificationNodeName) && isChecked) {
                    createNotification(notifier.object.path, notificationNodeName);
                }
            }
        }
        return actions;
    }

    createFilterActions(nodePath, graphID, userAddress) {
        const nodeID = MD5(nodePath);
        const actions = [];
        actions.push(Blackhole.Actions.update(nodeID, "type", "and"));
        actions.push(
            Blackhole.Actions.update(nodeID, "description", "New private message")
        );
        const convPrefixID = MD5(nodePath + "/conv_prefix");
        actions.push(Blackhole.Actions.update(nodeID, "children", "conv_prefix"));
        actions.push(Blackhole.Actions.update(convPrefixID, "type", "hasPrefix"));
        actions.push(Blackhole.Actions.update(convPrefixID, "tx-property", "data"));
        actions.push(
            Blackhole.Actions.update(
                convPrefixID,
                "expected-value",
                "urn:pi:graph:action:" + graphID
            )
        );
        const notPath = nodePath + "/not";
        actions.push(Blackhole.Actions.update(nodeID, "children", "not"));
        const notID = MD5(notPath);
        actions.push(Blackhole.Actions.update(notID, "type", "not"));
        actions.push(
            Blackhole.Actions.update(notID, "children", "address_is_not_me")
        );
        const addressIsNotMeID = MD5(notPath + "/address_is_not_me");
        actions.push(Blackhole.Actions.update(addressIsNotMeID, "type", "equals"));
        actions.push(
            Blackhole.Actions.update(
                addressIsNotMeID,
                "tx-property",
                "sender_blockchain_address"
            )
        );
        actions.push(
            Blackhole.Actions.update(addressIsNotMeID, "expected-value", userAddress)
        );
        return actions;
    }
}