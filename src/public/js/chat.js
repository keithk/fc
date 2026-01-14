let ws = null;
window.userId = null; // Make it global so auth.js can update it
window.userHandle = null;
window.currentSession = null;

function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {};

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "connected") {
      displayMessages(data.messages);
    } else if (data.type === "new_message") {
      displayMessage(data.message);
    } else if (data.type === "delete_message") {
      removeMessage(data.messageId);
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = () => {};
}

function displayMessages(messages) {
  const container = document.getElementById("messages-container");
  if (!container) return;

  container.innerHTML = "";
  // Display messages in reverse order (newest first)
  const reversed = [...messages].reverse();
  reversed.forEach((msg) => displayMessage(msg, true));
}

function removeMessage(messageId) {
  const container = document.getElementById("messages-container");
  if (!container) return;

  const messageEl = container.querySelector(`[data-message-id="${messageId}"]`);
  if (messageEl) {
    messageEl.remove();
  }
}

function displayMessage(message, skipPrepend = false) {
  const container = document.getElementById("messages-container");
  if (!container) return;

  const messageEl = document.createElement("div");
  messageEl.className = "message";
  messageEl.setAttribute("data-message-id", message.id);

  // Create handle link if available
  const handleLink = message.userHandle
    ? `<a href="https://bsky.app/profile/${message.userHandle}" target="_blank" class="message-handle">@${message.userHandle}</a>`
    : message.userId?.startsWith("did:")
      ? `<a href="https://bsky.app/profile/${message.userId}" target="_blank" class="message-did">@${message.userId.substring(8, 23)}...</a>`
      : "";

  // Determine if this is a video or image
  let mediaHtml = "";
  if (message.gif) {
    // Check if it's a video (data URL or blob URL from PDS)
    const isVideo =
      message.gif.startsWith("data:video/") ||
      message.gif.includes("sync.getBlob") ||
      message.gif.includes("video/mp4");
    if (isVideo) {
      mediaHtml = `<video src="${message.gif}" class="message-gif" autoplay loop muted playsinline></video>`;
    } else {
      mediaHtml = `<img src="${message.gif}" class="message-gif" alt="User GIF">`;
    }
  }

  // Build Bluesky link if cross-posted
  let bskyLink = "";
  if (message.blueskyPostUri) {
    const postId = message.blueskyPostUri.split("/").pop();
    const handle = message.userHandle || message.userId;
    const bskyUrl = `https://bsky.app/profile/${handle}/post/${postId}`;
    bskyLink = `<a href="${bskyUrl}" target="_blank" class="bsky-link" title="View on Bluesky">🦋</a>`;
  }

  // Show delete button if this is the current user's message
  let deleteBtn = "";
  if (window.userId && message.userId === window.userId) {
    deleteBtn = `<button class="delete-btn" onclick="deleteYourMessage('${message.id}')" title="Delete message">🗑️</button>`;
  }

  // Show expiration info if message expires
  let expiresHtml = "";
  if (message.expiresAt) {
    const expiresDate = new Date(message.expiresAt);
    const timeLeft = formatTimeLeft(expiresDate);
    expiresHtml = `<div class="message-expires">expires ${timeLeft}</div>`;
  }

  const html = `
    ${mediaHtml}
    <div class="message-content">
      <div class="message-text">${escapeHtml(message.text)}</div>
      ${expiresHtml}
      <div class="message-meta">
        ${handleLink}
        <span class="message-time">${formatTime(message.timestamp || Date.now())}</span>
        ${bskyLink}
        ${deleteBtn}
      </div>
    </div>
  `;

  messageEl.innerHTML = html;

  // Add to beginning (newest first) unless we're loading initial messages
  if (skipPrepend) {
    container.appendChild(messageEl);
  } else {
    container.insertBefore(messageEl, container.firstChild);
  }

  while (container.children.length > 20) {
    container.removeChild(container.lastChild);
  }
}

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
  };
  return text.replace(/[&<>"'/]/g, (char) => map[char]);
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeLeft(expiresDate) {
  const now = new Date();
  const diff = expiresDate - now;

  if (diff <= 0) return "soon";

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `in ${hours}h ${minutes % 60}m`;
  }
  return `in ${minutes}m`;
}

async function sendMessage(text, gifDataUrl) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  const message = {
    type: "chat",
    text: text,
    gif: gifDataUrl,
    userId: window.userId || "anonymous",
    userHandle: window.userHandle || null,
  };

  try {
    ws.send(JSON.stringify(message));
    return true;
  } catch (error) {
    return false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  connectWebSocket();
});
