// <fc-composer>: wraps the message form. Sends the clip + text to /api/message
// and fires `fc-posted` on success. One message per minute.

import "./fc-camera.js";

const COOLDOWN_SECONDS = 60;
// The lexicon limit is in UTF-8 bytes, so emoji count as several
const MAX_BYTES = 255;
const encoder = new TextEncoder();

class FcComposer extends HTMLElement {
  #coolingDown = false;

  connectedCallback() {
    this.form = this.querySelector("form");
    this.camera = this.querySelector("fc-camera");
    this.text = this.form.elements.text;
    this.send = this.form.querySelector('button[type="submit"]');
    this.status = this.querySelector(".composer-status");
    this.count = this.querySelector(".char-count");

    this.text.addEventListener("input", () => this.#updateSend());
    this.addEventListener("fc-clip", () => this.#updateSend());
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.#submit();
    });
  }

  #updateSend() {
    const bytes = encoder.encode(this.text.value.trim()).length;
    this.count.textContent = `${bytes} / ${MAX_BYTES}`;
    this.count.classList.toggle("over", bytes > MAX_BYTES);

    const ready = this.camera.clip && bytes > 0 && bytes <= MAX_BYTES;
    this.send.disabled = !ready || this.#coolingDown;
    if (!this.#coolingDown) {
      this.status.textContent = this.camera.clip ? "" : "Record a clip to send it along.";
    }
  }

  async #submit() {
    const data = new FormData(this.form);
    const extension = this.camera.clip.type.includes("mp4") ? "mp4" : "webm";
    data.set("video", this.camera.clip, `clip.${extension}`);
    data.set("text", this.text.value.trim());
    if (!data.get("expiresIn")) data.delete("expiresIn");

    this.send.disabled = true;
    this.status.textContent = "Sending to your PDS…";

    try {
      const response = await fetch("/api/message", { method: "POST", body: data });
      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        this.status.textContent = "You've been logged out. Reloading…";
        location.reload();
        return;
      }
      if (!response.ok) throw new Error(result.error || `The server said ${response.status}`);

      this.form.reset();
      this.camera.reset();
      this.dispatchEvent(new CustomEvent("fc-posted", { bubbles: true, detail: result }));
      this.#cooldown(result.blueskyPostUrl);
    } catch (error) {
      this.status.textContent = `That didn't send: ${error.message}`;
      this.#updateSend();
    }
  }

  #cooldown(blueskyPostUrl) {
    this.#coolingDown = true;
    this.send.disabled = true;
    let secondsLeft = COOLDOWN_SECONDS;
    const sent = blueskyPostUrl ? "Sent, and posted to Bluesky!" : "Sent!";

    const tick = () => {
      this.status.textContent = `${sent} You can send another in ${secondsLeft}s.`;
      if (secondsLeft-- === 0) {
        clearInterval(timer);
        this.#coolingDown = false;
        this.#updateSend();
      }
    };
    const timer = setInterval(tick, 1000);
    tick();
  }
}

customElements.define("fc-composer", FcComposer);
