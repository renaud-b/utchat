class ContactsList {
    constructor(container, address, context) {
        this.container = container;
        this.address = address;
        this.ctx = context;

        this.handleContactsLoaded = this.reloadAndRender.bind(this);
        this.ctx.eventBus.on("contacts:updated", this.handleContactsLoaded);
    }

    reloadAndRender() {
        Wormhole.getUserProfile(this.address).then((profile) => {
            if(!profile.hasNext("dapps")){
                return
            }
            const dapps = profile.next("dapps")
            if(!dapps.hasNext("contacts")){
                return
            }
            const contacts = dapps.next("contacts")
            Promise.all(contacts.children().map(node => {
                const contactAddress = node.object.name;
                Wormhole.getUserProfile(contactAddress).then((contactProfile) => {
                    let avatarUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2RkZGRkZCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjIwIiBmaWxsPSIjOTk5OTk5Ii8+PHJlY3QgeT0iNjAiIHdpZHRoPSI3MCIgaGVpZ2h0PSI0MCIgeD0iMTUiIGZpbGw9IiM5OTk5OTkiIHJ4PSIxNSIvPjwvc3ZnPg==';
                    if (contactProfile.object.profilePictureURL && contactProfile.object.profilePictureURL.length > 0) {
                        avatarUrl = "https://utopixia.com" + contactProfile.object.profilePictureURL;
                    }
                    this.ctx.contacts.push({
                        address: contactAddress,
                        name: convertHtmlCodesToAccents(contactProfile.object.graphName),
                        description: convertHtmlCodesToAccents(contactProfile.object.description || ""),
                        avatar: avatarUrl
                    });
                })
            })).then(() => {
                this.render()
            })
        })

    }

    render() {
        const contacts = this.ctx.contacts || [];
        this.container.innerHTML = `
            <div class="flex flex-col h-full">
                <!-- Header -->
                <div class="flex items-center justify-between p-3 bg-gray-800 border-b border-gray-700">
                    <button id="btn-back" class="text-white text-lg">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <div class="font-bold text-base">📇 Mes Contacts</div>
                    <button id="btn-add-contact" class="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded">
                        Ajouter
                    </button>
                </div>
                
                <!-- Contacts list -->
                <ul class="flex-1 overflow-y-auto p-3 space-y-2">
                    ${
            contacts.length === 0
                ? `<li class="text-gray-500 text-center">Aucun contact pour l'instant</li>`
                : contacts.map(c => `
                        <li class="p-3 bg-gray-700 rounded cursor-pointer hover:bg-gray-600" data-contact="${c.address}">
                            <div class="flex items-center space-x-3">
                                <img src="${c.avatar}" class="w-10 h-10 rounded-full" />
                                <div>
                                    <div class="font-bold">${c.name || c.address}</div>
                                    <div class="text-xs text-gray-400">${c.address}</div>
                                </div>
                            </div>
                        </li>
                        `).join('')
        }
                </ul>
            </div>
        `;
        this.attachEvents();
    }

    attachEvents() {
        // Retour
        this.container.querySelector('#btn-back').addEventListener('click', () => {
            window.UtopixiaChat.ScreenManager.show("groupList");
        });

        // Ajout de contact
        this.container.querySelector('#btn-add-contact').addEventListener('click', () => {
            document.getElementById('modal-add-contact').classList.remove('hidden');
        });

        // Sélection d'un contact
        this.container.querySelectorAll('[data-contact]').forEach(el => {
            el.addEventListener('click', () => {
                const address = el.getAttribute('data-contact');
                const contact = this.ctx.contacts.find(c => c.address === address);
                if (contact) {
                    this.showContactDetails(contact);
                }
            });
        });
    }

    showContactDetails(contact) {
        const modal = document.getElementById('modal-profile');
        document.getElementById('profile-name').innerText = contact.name || contact.address;
        document.getElementById('profile-address').innerText = contact.address;
        document.getElementById('profile-picture').src = contact.avatar;
        document.getElementById('profile-description').innerText = contact.description || '';
        modal.classList.remove('hidden');
    }

    destroy() {
    }
}

window.UtopixiaChat = window.UtopixiaChat || {};
window.UtopixiaChat.ContactsList = ContactsList;
