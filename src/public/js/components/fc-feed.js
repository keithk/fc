// <fc-feed viewer="did:…">: the live list of the last 20 messages, fed by the /ws WebSocket.
// Messages from the viewer get a delete button.

import "./fc-message.js";

const MAX_MESSAGES = 20;
const RECONNECT_MS = 3000;

class FcFeed extends HTMLElement {
  #list;
  #socket;

  connectedCallback() {
    this.#list = this.querySelector(".feed");
    this.#connect();
  }

  disconnectedCallback() {
    this.#socket?.close();
  }

  #connect() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    this.#socket = new WebSocket(`${protocol}//${location.host}/ws`);

    this.#socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "connected") this.#showAll(data.messages);
      if (data.type === "new_message") this.#add(data.message);
      if (data.type === "delete_message") this.remove(data.messageId);
    });

    this.#socket.addEventListener("close", () => {
      if (this.isConnected) setTimeout(() => this.#connect(), RECONNECT_MS);
    });
  }

  #item(message) {
    const item = document.createElement("li");
    item.dataset.id = message.id;
    const card = document.createElement("fc-message");
    card.deletable = message.userId === this.getAttribute("viewer");
    card.message = message;
    item.append(card);
    return item;
  }

  #showAll(messages) {
    // The server sends oldest first; show newest first
    this.#list.replaceChildren(...messages.toReversed().map((m) => this.#item(m)));
    this.#showEmptyState();
  }

  #add(message) {
    this.remove(message.id);
    this.#list.prepend(this.#item(message));
    while (this.#list.children.length > MAX_MESSAGES) this.#list.lastChild.remove();
    this.#showEmptyState();
  }

  remove(id) {
    this.#list.querySelector(`li[data-id="${CSS.escape(id)}"]`)?.remove();
    this.#showEmptyState();
  }

  #showEmptyState() {
    this.#list.querySelector(".feed-empty")?.remove();
    if (this.#list.children.length === 0) {
      const empty = document.createElement("li");
      empty.className = "feed-empty";
      empty.textContent = "No messages yet. Be the first to say hi!";
      this.#list.append(empty);
    }
  }
}

customElements.define("fc-feed", FcFeed);
