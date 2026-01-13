let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let currentGifUrl = null;
let rateLimitTimer = null;

async function initCamera() {
  try {
    const video = document.getElementById("video-preview");
    if (!video) return;

    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });

    video.srcObject = mediaStream;

    document.getElementById("start-camera").style.display = "none";
    document.getElementById("record-button").disabled = false;

    return true;
  } catch (error) {
    console.error("Failed to access camera:", error);
    alert("Please allow camera access to use Face Chat");
    return false;
  }
}

async function startRecording() {
  if (!mediaStream || isRecording) return;

  const recordButton = document.getElementById("record-button");
  const countdown = document.getElementById("countdown");
  const video = document.getElementById("video-preview");

  recordedChunks = [];
  isRecording = true;

  if (recordButton) {
    recordButton.disabled = true;
    recordButton.textContent = "⏺️ Recording...";
  }

  let secondsLeft = 2;
  if (countdown) {
    countdown.style.display = "block";
    countdown.textContent = secondsLeft;
  }

  // Create a higher quality canvas for recording
  const canvas = document.getElementById("gif-canvas");
  const ctx = canvas.getContext("2d");

  // Use smaller dimensions for faster upload
  const videoWidth = 480;
  const videoHeight = 360;

  canvas.width = videoWidth;
  canvas.height = videoHeight;

  // Create a MediaRecorder to capture video
  const canvasStream = canvas.captureStream(15); // 15 fps for smaller file size

  // Try to find the best supported codec
  let options = { videoBitsPerSecond: 1000000 }; // 1 Mbps - good for 480p

  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
    options.mimeType = "video/webm;codecs=vp9";
  } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
    options.mimeType = "video/webm;codecs=vp8";
  } else if (MediaRecorder.isTypeSupported("video/webm")) {
    options.mimeType = "video/webm";
  } else if (MediaRecorder.isTypeSupported("video/mp4")) {
    options.mimeType = "video/mp4";
  }

  console.log("Using codec:", options.mimeType);
  const recorder = new MediaRecorder(canvasStream, options);

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  recorder.onstop = async () => {
    const videoBlob = new Blob(chunks, { type: "video/webm" });

    // Convert to MP4 using canvas and re-encoding
    // For now, we'll use the webm directly - Bluesky supports it
    const url = URL.createObjectURL(videoBlob);
    displayGifPreview(url, videoBlob);
  };

  // Start drawing video to canvas at 30fps
  const drawFrame = () => {
    if (!isRecording) return;
    ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
    requestAnimationFrame(drawFrame);
  };

  recorder.start();
  drawFrame();

  const countdownInterval = setInterval(() => {
    secondsLeft--;
    if (countdown) countdown.textContent = secondsLeft;

    if (secondsLeft === 0) {
      clearInterval(countdownInterval);
      isRecording = false;
      recorder.stop();

      if (countdown) countdown.style.display = "none";
      if (recordButton) {
        recordButton.textContent = "🔴 Record GIF";
        recordButton.disabled = false;
      }
    }
  }, 1000);
}

let currentVideoBlob = null;

function displayGifPreview(url, videoBlob) {
  const video = document.getElementById("video-preview");
  const preview = document.getElementById("gif-preview");
  const clearButton = document.getElementById("clear-gif");

  if (currentGifUrl) {
    URL.revokeObjectURL(currentGifUrl);
  }

  currentGifUrl = url;
  currentVideoBlob = videoBlob;

  if (video) video.style.display = "none";
  if (preview) {
    preview.src = url;
    preview.style.display = "block";
    preview.load(); // Load the video
    preview.play(); // Start playing
  }
  if (clearButton) clearButton.style.display = "inline-block";

  checkCanSend();
}

function clearGif() {
  const video = document.getElementById("video-preview");
  const preview = document.getElementById("gif-preview");
  const clearButton = document.getElementById("clear-gif");

  if (currentGifUrl) {
    URL.revokeObjectURL(currentGifUrl);
    currentGifUrl = null;
  }

  currentVideoBlob = null;

  if (video) video.style.display = "block";
  if (preview) {
    preview.style.display = "none";
    preview.src = "";
  }
  if (clearButton) clearButton.style.display = "none";

  checkCanSend();
}

function checkCanSend() {
  const sendButton = document.getElementById("send-button");
  const messageText = document.getElementById("message-text");

  if (sendButton && messageText) {
    const hasText = messageText.value.trim().length > 0;
    const hasGif = currentGifUrl !== null;
    sendButton.disabled = !(hasText && hasGif);
  }
}

async function convertGifToDataUrl(blobUrl) {
  try {
    // Use the stored video blob directly instead of fetching
    const blob =
      currentVideoBlob || (await fetch(blobUrl).then((r) => r.blob()));
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Failed to convert video:", error);
    return null;
  }
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const startButton = document.getElementById("start-camera");
  const recordButton = document.getElementById("record-button");
  const clearButton = document.getElementById("clear-gif");
  const messageText = document.getElementById("message-text");
  const charCount = document.getElementById("char-count");
  const sendButton = document.getElementById("send-button");

  if (startButton) {
    startButton.addEventListener("click", initCamera);
  }

  if (recordButton) {
    recordButton.addEventListener("click", startRecording);
  }

  if (clearButton) {
    clearButton.addEventListener("click", clearGif);
  }

  if (messageText) {
    messageText.addEventListener("input", (e) => {
      const length = e.target.value.length;
      if (charCount) {
        charCount.textContent = `${length} / 255`;
      }
      checkCanSend();
    });
  }

  if (sendButton) {
    sendButton.addEventListener("click", async () => {
      if (!messageText || !currentGifUrl) return;

      const text = messageText.value.trim();
      if (!text) return;

      // Check if user is logged in
      if (!window.userId || window.userId === "anonymous") {
        alert("Please login with Bluesky to send messages");
        return;
      }

      // Check rate limit
      if (!canSendMessage()) {
        console.log("Rate limit active, cannot send yet");
        alert("Please wait 1 minute between messages");
        return;
      }

      console.log("Attempting to send message...");
      sendButton.disabled = true;
      sendButton.textContent = "Sending...";

      const gifDataUrl = await convertGifToDataUrl(currentGifUrl);
      console.log("GIF converted, sending to server...");

      // Get options from UI
      const postToBlueskyCheckbox = document.getElementById("post-to-bluesky");
      const expiresInSelect = document.getElementById("expires-in");
      const shouldPostToBluesky = postToBlueskyCheckbox?.checked;
      const expiresIn = expiresInSelect?.value || null;

      console.log("Post options:", {
        postToBsky: shouldPostToBluesky,
        expiresIn,
      });

      // Post to our custom lexicon via API (Jetstream will broadcast to all clients)
      if (window.postMessage) {
        try {
          const result = await window.postMessage(text, gifDataUrl, {
            postToBsky: shouldPostToBluesky,
            expiresIn: expiresIn,
          });

          if (result.success) {
            console.log("Message posted successfully:", result);

            if (result.blueskyPostUrl) {
              console.log("Also posted to Bluesky:", result.blueskyPostUrl);
            }

            messageText.value = "";
            if (charCount) charCount.textContent = "0 / 255";
            clearGif();

            // Reset expiration to default
            if (expiresInSelect) expiresInSelect.value = "";

            // Only show rate limit after successful send
            showRateLimit();
          } else {
            console.log("Message failed to post:", result.error);
            alert("Failed to send message: " + result.error);
            sendButton.textContent = "Send Message";
            checkCanSend();
          }
        } catch (error) {
          console.error("Error posting message:", error);
          alert("Failed to send message. Check your connection.");
          sendButton.textContent = "Send Message";
          checkCanSend();
        }
      } else {
        console.error("postMessage function not available");
        alert("Authentication error. Please refresh and try again.");
        sendButton.textContent = "Send Message";
        checkCanSend();
      }
    });
  }
});

let lastMessageTime = 0;

function showRateLimit() {
  const warning = document.getElementById("rate-limit-warning");
  if (warning) {
    warning.style.display = "block";
    setTimeout(() => {
      warning.style.display = "none";
    }, 60000);
  }

  const sendButton = document.getElementById("send-button");
  if (sendButton) {
    sendButton.disabled = true;
    lastMessageTime = Date.now();
    let secondsLeft = 60;

    const interval = setInterval(() => {
      secondsLeft--;
      sendButton.textContent = `Wait ${secondsLeft}s`;

      if (secondsLeft === 0) {
        clearInterval(interval);
        sendButton.textContent = "Send Message";
        checkCanSend();
      }
    }, 1000);
  }
}

function canSendMessage() {
  const now = Date.now();
  const timeSinceLastMessage = now - lastMessageTime;
  const canSend = timeSinceLastMessage >= 60000 || lastMessageTime === 0;
  console.log("Rate limit check:", {
    lastMessageTime,
    now,
    timeSinceLastMessage,
    canSend,
  });
  return canSend;
}

window.addEventListener("beforeunload", stopCamera);
