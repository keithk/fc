// <fc-my-messages>: everything the logged-in user has posted, read from their PDS.
// Call `.load()` to refresh; `.remove(rkey)` drops one after a delete.

import "./fc-message.js";

class FcMyMessages extends HTMLElement {
  #list;

  connectedCallback() {
    this.#list = this.querySelector(".my-messages");
    this.load();
  }

  async load() {
    try {
      const response = await fetch("/api/my-posts");
      const { posts, error } = await response.json();
      if (!response.ok) throw new Error(error);

      if (posts.length === 0) {
        this.#message("You haven't posted anything yet.");
        return;
      }

      this.#list.replaceChildren(
        ...posts.map((post) => {
          const item = document.createElement("li");
          item.dataset.rkey = post.rkey;
          const card = document.createElement("fc-message");
          card.deletable = true;
          card.message = {
            id: post.uri,
            text: post.text,
            userId: post.uri.split("/")[2],
            userHandle: document.body.dataset.handle,
            timestamp: post.createdAt,
            videoUrl: post.videoUrl,
            blueskyPostUri: post.blueskyPostUri,
            expiresAt: post.expiresAt,
          };
          item.append(card);
          return item;
        }),
      );
    } catch (error) {
      this.#message(`Couldn't load your messages from your PDS: ${error.message}`);
    }
  }

  remove(rkey) {
    this.#list.querySelector(`li[data-rkey="${CSS.escape(rkey)}"]`)?.remove();
    if (this.#list.children.length === 0) this.#message("You haven't posted anything yet.");
  }

  #message(text) {
    const item = document.createElement("li");
    item.className = "feed-empty";
    item.textContent = text;
    this.#list.replaceChildren(item);
  }
}

customElements.define("fc-my-messages", FcMyMessages);
