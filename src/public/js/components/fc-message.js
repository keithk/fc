// <fc-message>: one message card. Set `.message` (and `.deletable`) to render.
// Deleting takes two clicks and fires a bubbling `fc-delete` event with the record's rkey.

import { formatTime, formatTimeLeft, rkeyOf } from "../format.js";

const CONFIRM_WINDOW_MS = 4000;

class FcMessage extends HTMLElement {
  #message = null;
  deletable = false;

  set message(message) {
    this.#message = message;
    this.render();
  }

  get message() {
    return this.#message;
  }

  render() {
    const m = this.#message;
    if (!m) return;
    this.replaceChildren();

    const card = document.createElement("article");
    card.className = "message";

    if (m.videoUrl) {
      const video = document.createElement("video");
      video.className = "message-video";
      video.src = m.videoUrl;
      Object.assign(video, { autoplay: true, loop: true, muted: true, playsInline: true });
      card.append(video);
    }

    const body = document.createElement("div");
    body.className = "message-body";

    const meta = document.createElement("p");
    meta.className = "message-meta";
    const who = document.createElement("a");
    who.href = `https://bsky.app/profile/${m.userId}`;
    who.textContent = m.userHandle ? `@${m.userHandle}` : m.userId;
    meta.append(who, ` · ${formatTime(m.timestamp)}`);

    const text = document.createElement("p");
    text.className = "message-text";
    text.textContent = m.text;

    body.append(meta, text);

    const extras = [];
    if (m.expiresAt) {
      const span = document.createElement("span");
      span.textContent = `Deletes itself ${formatTimeLeft(m.expiresAt)}`;
      extras.push(span);
    }
    if (m.blueskyPostUri) {
      const link = document.createElement("a");
      link.href = `https://bsky.app/profile/${m.userId}/post/${rkeyOf(m.blueskyPostUri)}`;
      link.textContent = "On Bluesky";
      extras.push(link);
    }
    if (this.deletable) extras.push(this.#deleteButton());

    if (extras.length) {
      const row = document.createElement("p");
      row.className = "message-extras";
      row.append(...extras);
      body.append(row);
    }

    card.append(body);
    this.append(card);
  }

  #deleteButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "link-button message-delete";
    button.textContent = "Delete";

    let timer;
    button.addEventListener("click", () => {
      if (button.dataset.confirming) {
        clearTimeout(timer);
        button.disabled = true;
        button.textContent = "Deleting…";
        this.dispatchEvent(
          new CustomEvent("fc-delete", {
            bubbles: true,
            detail: { rkey: rkeyOf(this.#message.id) },
          }),
        );
        return;
      }
      button.dataset.confirming = "true";
      button.textContent = "Really delete?";
      timer = setTimeout(() => {
        delete button.dataset.confirming;
        button.textContent = "Delete";
      }, CONFIRM_WINDOW_MS);
    });
    return button;
  }

  deleteFailed() {
    this.render();
  }
}

customElements.define("fc-message", FcMessage);
