Singularity.hostname = "https://utopixia.com"
Singularity.endpoint = Singularity.hostname + "/singularity"
Blackhole.hostname = Singularity.hostname
Wormhole.hostname = Singularity.hostname
blockchainUpdateManager.hostname = Singularity.endpoint

const eventManager = new EventManager((data) => {
    const address = data.address; // clé publique déjà connue


    const events = new EventBus();
    const notificationService = new NotificationService(address);
    const writeService = new GraphWriteService(eventManager, address);
    const store = new LocalStoreService(address);
    const ctx = new Context(address, store, events);
    const graph = new GraphService(ctx, store);
    const sync = new SyncController(graph, store, eventManager, ctx, events);

    window.UtopixiaChat.app = {ctx: ctx, store: store, graph: graph, events: events, sync: sync};

    window.UtopixiaChat.ScreenManager.register("loadingWelcome", function () {
        const view = new LoadingWelcome(document.getElementById("screen"));
        view.render();
        return view
    });
    window.UtopixiaChat.ScreenManager.register("groupList", function () {
        const view = new GroupList(
            eventManager,
            document.getElementById("screen"),
            store,
            graph,
            ctx,
            events,
            writeService
        );
        view.render();
        return view
    });
    window.UtopixiaChat.ScreenManager.register("messageView", (data) => {
        const view = new MessageList(
            document.getElementById("screen"),
            store,
            writeService,
            window.UtopixiaChat.app.ctx,
            window.UtopixiaChat.app.events,
            data.threadId,
            notificationService
        );
        view.render();
        return view
    });
    window.UtopixiaChat.ScreenManager.register("contactsList", function () {
        const view = new ContactsList(
            document.getElementById("screen"),
            address,
            ctx
        );
        view.render();
        return view;
    });
    window.UtopixiaChat.ScreenManager.register("userProfile", function () {
        const view = new UserProfileScreen(
            document.getElementById("screen"),
            store,
            ctx,
            events,
            eventManager
        );
        view.render();
        return view;
    });
    window.UtopixiaChat.ScreenManager.register("publicGroupExplorer", function () {
        const view = new PublicGroupExplorer(document.getElementById("screen"), store, ctx, events);
        view.render();
        return view;
    });

    const localProfile = store.loadProfile(address);
    if (localProfile) {
        ctx.profile = localProfile;
        events.emit("profile:loaded", localProfile);
    }

    writeService.registerUser().then(() => {
        let hasBeenLoaded = false
        const rawGroups = store.loadGroups(address);
        if (rawGroups) {
            const groups = rawGroups.map(g => Group.deserialize(g, ctx));
            ctx.setGroups(groups);
            hasBeenLoaded = true;

            const groupId = store.loadGroupId();
            if (groupId != null) {
                ctx.setGroupId(groupId);
            } else if (ctx.groups.length > 0) {
                ctx.setGroupId(ctx.groups[0].id);
            }

            const threadId = store.loadThreadId()
            if (threadId != null) {
                ctx.setThreadId(threadId);
                graph.fetchUserGroups(eventManager, address).then(groups => {
                    ctx.setGroups(groups);
                    store.saveGroups(ctx.groups.map(g => g.serialize()));
                });

                window.UtopixiaChat.ScreenManager.show('messageView', {threadId});
            } else {
                window.UtopixiaChat.ScreenManager.show("groupList");
            }
        }

        const rawUsers = store.loadUsers(address);
        if (rawUsers) {
            ctx.users = rawUsers
            events.emit("users:loaded", rawUsers);
        }


        if (!hasBeenLoaded) {
            window.UtopixiaChat.ScreenManager.show("loadingWelcome");
        }

        graph.fetchProfile(address).then((profile) => {
            ctx.profile = profile;
            store.saveProfile(profile);
            events.emit("profile:loaded", profile);
        });

        graph.fetchUserGroups(eventManager, address).then(groups => {
            ctx.setGroups(groups);
            store.saveGroups(ctx.groups.map(g => g.serialize()));
            if (!hasBeenLoaded) {
                window.UtopixiaChat.ScreenManager.show("groupList");
            }
        });

        sync.start();

        document.getElementById("btn-confirm-add-contact").addEventListener("click", () => {
            const addressInput = document.getElementById("add-contact-address");
            const contactAddress = addressInput.value.trim();
            if (!contactAddress) {
                alert("Veuillez entrer une adresse valide.");
                return;
            }

            Wormhole.getUserProfile(contactAddress).then((contactProfile) => {
                Wormhole.getUserProfile(address).then((userProfile) => {
                    const contactsNode = userProfile.next("dapps").next("contacts")
                    const contactAction = Blackhole.Actions.makeUpdate(userProfile.graphID, contactsNode.object.id, "children", contactAddress)
                    eventManager.sign(address, contactAction, 0).then((signedTx) => {
                        Singularity.saveSignedTx(signedTx).then((res) => {
                            Singularity.waitForTx(res.UUID).then(() => {
                                console.log("Contact ajouté avec succès :", contactAddress);
                            });
                        });
                    })
                })

                let avatarUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2RkZGRkZCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjIwIiBmaWxsPSIjOTk5OTk5Ii8+PHJlY3QgeT0iNjAiIHdpZHRoPSI3MCIgaGVpZ2h0PSI0MCIgeD0iMTUiIGZpbGw9IiM5OTk5OTkiIHJ4PSIxNSIvPjwvc3ZnPg==';
                if (contactProfile.object.profilePictureURL && contactProfile.object.profilePictureURL.length > 0) {
                    avatarUrl = "https://utopixia.com" + contactProfile.object.profilePictureURL;
                }
                ctx.contacts.push({
                    address: contactAddress,
                    name: convertHtmlCodesToAccents(contactProfile.object.graphName),
                    description: convertHtmlCodesToAccents(contactProfile.object.description || ""),
                    avatar: avatarUrl
                });

                events.emit("contacts:updated", ctx.users);
                document.getElementById("modal-add-contact").classList.add("hidden");
                addressInput.value = "";

            }).catch(err => {
                console.error("Erreur lors de l'ajout du contact :", err);
                alert("Erreur lors de l'ajout du contact : " + err.message);
            });
        })

        document.getElementById("thread-config-save").addEventListener("click", () => {
            const threadName = document.getElementById("group-config-name").value.trim();
            const currentThread = ctx.getCurrentThread()


            const isChecked = document.getElementById("group-config-notify").checked;
            notificationService.isNotificationActivated(currentThread.id).then((isActivated) => {
                console.log("Notification state for thread:", currentThread.id, "isActivated:", isActivated, "isChecked:", isChecked);
                if(isActivated !== isChecked){
                    let threadGraphID = currentThread.id;
                    if(currentThread.type !== "private"){
                        threadGraphID = currentThread.graphID
                    }
                    Wormhole.getUserProfile(address).then((userProfileGraph) => {
                        notificationService.updateNotificationState(eventManager, userProfileGraph, currentThread.id, threadGraphID, isChecked).then(() => {
                            console.log("Notification state updated for thread:", threadGraphID, "to", isChecked);
                        })
                    })
                }
            })




            if(currentThread.type === "private"){
                const threadGraphID = currentThread.id;
                if(threadName === currentThread.name){
                    document.getElementById("modal-thread-config").classList.add("hidden");
                    return
                }
                if (threadName.length > 0) {
                    writeService.renamePrivateThread(threadGraphID, threadName).then(() => {
                        document.getElementById("modal-thread-config").classList.add("hidden");
                        events.emit("thread:updated", {id: threadGraphID, name: threadName});
                    }).catch(err => {
                        console.error("Erreur lors de la sauvegarde du nom du thread :", err);
                    });
                } else {
                    console.warn("Le nom du thread ne peut pas être vide.");
                }
            } else{
                const groupGraphID =  currentThread.graphID;
                const threadID = currentThread.threadID;


                if(currentThread.authorizedUsers.length === 0 || (currentThread.authorizedUsers.length > 0 && !currentThread.authorizedUsers.some((user) => user === address))){
                    document.getElementById("modal-thread-config").classList.add("hidden");
                    return
                }
                let newThreadName = currentThread.name
                if(threadName.length > 0){
                    newThreadName = threadName
                }

                const userListItems = document.querySelectorAll('#group-config-user-list [data-remove-user]');
                const authorizedUsers = Array.from(userListItems).map(li => li.getAttribute('data-remove-user')).filter(Boolean);

                writeService.editThread(threadID, groupGraphID, newThreadName, authorizedUsers.join(';')).then(() => {
                    document.getElementById("modal-thread-config").classList.add("hidden");
                    currentThread.name = newThreadName;
                    currentThread.authorizedUsers = authorizedUsers;
                    ctx.updateThread(currentThread.id, currentThread);
                    store.saveGroups(ctx.groups.map(g => g.serialize()));
                    events.emit("thread:updated", {
                        id: groupGraphID+"_"+threadID,
                        name: threadName,
                        authorizedUsers: authorizedUsers,
                    });

                })

            }

        })


        document.getElementById('create-thread-btn').addEventListener('click', () => {
            const threadName = document.getElementById('new-channel-name').value.trim();
            if (!threadName) {
                alert("Veuillez entrer un nom de thread.");
                return;
            }

            const groupId = ctx.selectedGroupId;

            writeService.createThread(groupId, threadName).then((contractResponse) => {
                document.getElementById('modal-create-thread').classList.add('hidden');
                document.getElementById('new-channel-name').value = "";

                const newThreadID = contractResponse.nodeID
                const currentGroup = ctx.getCurrentGroup();
                currentGroup.createPublicThread(currentGroup.id + "_" + newThreadID, currentGroup.id, newThreadID, threadName, ctx.address);
                store.saveGroups(ctx.groups.map(g => g.serialize()))
                events.emit("groups:updated", ctx.groups);
            }).catch(err => {
                console.error("Erreur lors de la création du thread :", err);
            });
        });

    }).catch((err) => {
        console.error("Erreur lors de l'enregistrement de l'utilisateur :", err);
        alert("Erreur lors de l'enregistrement de l'utilisateur : " + err.message);
    })
})


// generic bindings
const profileAddress = document.getElementById("profile-address");
const copyBtn = document.getElementById("btn-copy-address");

copyBtn.onclick = () => {
    navigator.clipboard.writeText(profileAddress.textContent).then(() => {
        copyBtn.textContent = "✅ Copié !";
        setTimeout(() => {
            copyBtn.textContent = "📋 Copier";
        }, 2000);
    });
};

document.getElementById("close-modal-reactions").addEventListener("click", () => {
    document.getElementById("modal-reactions").classList.add("hidden");
});

document.getElementById('btn-scan-qrcode').addEventListener('click', () => {
    document.getElementById('modal-add-contact').classList.add('hidden');
    startQRCodeScanner().then(addr => {
        if (addr) {
            document.getElementById('add-contact-address').value = addr;
            document.getElementById('modal-add-contact').classList.remove('hidden');
        } else {
            console.warn("Aucune adresse détectée.");
        }
    }).catch(err => {
        console.error("Erreur QR code scanner :", err);
    });
});


function startQRCodeScanner() {
    return new Promise((resolve, reject) => {
        const scannerContainer = document.getElementById('qrcode-scanner-container');
        scannerContainer.classList.remove('hidden');

        const html5QrCode = new Html5Qrcode("qrcode-reader");

        html5QrCode.start(
            {facingMode: "environment"},
            {
                fps: 10,
                qrbox: {width: 250, height: 250}
            },
            (decodedText) => {
                html5QrCode.stop().then(() => {
                    scannerContainer.classList.add('hidden');
                    const match = decodedText.match(/^utopixia:address:(.+)$/);
                    if (match) {
                        resolve(match[1]);
                    } else {
                        resolve(null);
                    }
                }).catch(err => {
                    console.error("Erreur arrêt scanner :", err);
                    reject(err);
                });
            },
            (err) => {
                // Optionnel : gérer les erreurs de détection, ici on ignore
            }
        ).catch(err => {
            console.error("Erreur démarrage scanner :", err);
            reject(err);
        });

        document.getElementById('btn-cancel-qrcode').onclick = () => {
            html5QrCode.stop().then(() => {
                scannerContainer.classList.add('hidden');
                resolve(null);
            }).catch(err => {
                console.error("Erreur arrêt scanner :", err);
                reject(err);
            });
        };
    });
}


document.getElementById("delete-thread-btn").addEventListener("click", () => {
    const ctx = window.UtopixiaChat.app.ctx;
    const writeService = new GraphWriteService(window.UtopixiaChat.app.sync.eventManager, ctx.address);

    const currentThread = ctx.getCurrentThread();
    if (!currentThread) {
        console.error("Thread non trouvé.");
        return;
    }

    // Identifier le groupGraphID
    const group = ctx.findGroupByThreadId(currentThread.id);
    if (!group) {
        console.error("Groupe non trouvé pour ce thread.");
        return;
    }

    const groupGraphID = group.id;
    const threadID = currentThread.threadID; // Pour public thread
    if (currentThread.type === "private") {
        console.warn("La suppression de thread privé n’est pas encore gérée.");
        return;
    }

    if (!confirm("Es-tu sûr de vouloir supprimer ce thread ?")) {
        return;
    }


    writeService.deleteThread(threadID, groupGraphID).then(() => {
        // Retirer le thread localement
        group.threads = group.threads.filter(t => t.id !== currentThread.id);
        window.UtopixiaChat.app.ctx.setThreadId(null)
        window.UtopixiaChat.app.ctx.setGroups(window.UtopixiaChat.app.ctx.groups);
        window.UtopixiaChat.app.store.saveThreadId(null)
        window.UtopixiaChat.app.store.saveGroups(window.UtopixiaChat.app.ctx.groups.map(g => g.serialize()));

        // Fermer modale + retour groupList
        document.getElementById("modal-thread-config").classList.add("hidden");
        window.UtopixiaChat.ScreenManager.show("groupList");

    }).catch((err) => {
        console.error("Erreur lors de la suppression :", err);
        alert("Erreur lors de la suppression : " + err);
    })
});


window.addEventListener("message", (event) => {
    let data = event.data;
    if (typeof data === "string") {
        try {
            data = JSON.parse(data);
        } catch (_) {
            return;
        }
    }
    if (data.type === "back") {
        window.UtopixiaChat.ScreenManager.back();
    }
});

