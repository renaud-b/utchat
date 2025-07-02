class LoadingWelcome {
    constructor(container, address) {
        this.container = container;
        window.UtopixiaChat.app.events.on("profile:loaded", this.render.bind(this));

    }

    render(profile) {
        this.container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-center">
        ${profile?.object.profilePictureURL ? `<img src="https://utopixia.com${profile.object.profilePictureURL}" class="w-24 h-24 rounded-full mb-4" />` : ''}
        <h1 class="text-2xl font-bold">Bon retour parmi nous${profile?.object.graphName ? `, ${profile.object.graphName}` : ''} !</h1>
        <p class="text-sm text-gray-400 mt-2">Chargement des derniers messages...</p>
        <i class="fas fa-spinner fa-spin text-blue-500 mt-4" style="font-size:  3em"></i>
      </div>
    `;
    }
}

