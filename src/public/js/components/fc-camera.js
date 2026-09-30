// <fc-camera>: webcam preview that records a 2-second 4:3 clip.
// Fires `fc-clip` with { blob } after recording, or { blob: null } when cleared.

const CLIP_SECONDS = 2;
const WIDTH = 720;
const HEIGHT = 540;

function pickMimeType() {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

class FcCamera extends HTMLElement {
  clip = null;
  #stream = null;
  #clipUrl = null;

  connectedCallback() {
    this.live = this.querySelector(".camera-live");
    this.preview = this.querySelector(".camera-clip");
    this.idle = this.querySelector(".camera-idle");
    this.countdown = this.querySelector(".camera-countdown");
    this.startButton = this.querySelector('[data-action="start"]');
    this.recordButton = this.querySelector('[data-action="record"]');
    this.retakeButton = this.querySelector('[data-action="retake"]');

    this.startButton.addEventListener("click", () => this.start());
    this.recordButton.addEventListener("click", () => this.record());
    this.retakeButton.addEventListener("click", () => this.reset());
    window.addEventListener("pagehide", () => this.stop());
  }

  disconnectedCallback() {
    this.stop();
  }

  async start() {
    try {
      this.#stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch {
      this.idle.textContent =
        "Your browser didn't give us the camera. Check the camera permission for this site and try again.";
      return;
    }
    this.live.srcObject = this.#stream;
    this.idle.hidden = true;
    this.startButton.hidden = true;
    this.recordButton.hidden = false;
    this.dataset.state = "live";
  }

  stop() {
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#stream = null;
  }

  record() {
    if (!this.#stream || this.dataset.state === "recording") return;
    this.dataset.state = "recording";
    this.recordButton.disabled = true;

    // Draw through a canvas so every clip is the same 4:3 size, center-cropped
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    const { videoWidth: vw, videoHeight: vh } = this.live;
    const scale = Math.max(WIDTH / vw, HEIGHT / vh);
    const sw = WIDTH / scale;
    const sh = HEIGHT / scale;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;

    const recorder = new MediaRecorder(canvas.captureStream(24), {
      mimeType: pickMimeType(),
      videoBitsPerSecond: 2_500_000,
    });
    const chunks = [];
    recorder.addEventListener("dataavailable", (e) => e.data.size && chunks.push(e.data));
    recorder.addEventListener("stop", () => {
      this.#showClip(new Blob(chunks, { type: recorder.mimeType }));
    });

    const draw = () => {
      if (recorder.state !== "recording") return;
      ctx.drawImage(this.live, sx, sy, sw, sh, 0, 0, WIDTH, HEIGHT);
      requestAnimationFrame(draw);
    };
    recorder.start();
    draw();

    let secondsLeft = CLIP_SECONDS;
    this.countdown.textContent = secondsLeft;
    const tick = setInterval(() => {
      secondsLeft--;
      this.countdown.textContent = secondsLeft || "";
      if (secondsLeft === 0) {
        clearInterval(tick);
        recorder.stop();
      }
    }, 1000);
  }

  #showClip(blob) {
    this.clip = blob;
    if (this.#clipUrl) URL.revokeObjectURL(this.#clipUrl);
    this.#clipUrl = URL.createObjectURL(blob);
    this.preview.src = this.#clipUrl;
    this.preview.hidden = false;
    this.preview.play();
    this.live.hidden = true;
    this.recordButton.hidden = true;
    this.recordButton.disabled = false;
    this.retakeButton.hidden = false;
    this.dataset.state = "clip";
    this.dispatchEvent(new CustomEvent("fc-clip", { bubbles: true, detail: { blob } }));
  }

  reset() {
    this.clip = null;
    if (this.#clipUrl) URL.revokeObjectURL(this.#clipUrl);
    this.#clipUrl = null;
    this.preview.hidden = true;
    this.preview.removeAttribute("src");
    this.live.hidden = false;
    this.retakeButton.hidden = true;
    this.recordButton.hidden = !this.#stream;
    this.dataset.state = this.#stream ? "live" : "";
    this.dispatchEvent(new CustomEvent("fc-clip", { bubbles: true, detail: { blob: null } }));
  }
}

customElements.define("fc-camera", FcCamera);
