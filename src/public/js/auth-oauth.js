// OAuth-based authentication for Face Chat
// Works with public URLs using server-side OAuth flow

let currentSession = null;

async function initAuth() {
  // Check for stored session
  const storedSession = localStorage.getItem("bsky_session");
  if (storedSession) {
    try {
      currentSession = JSON.parse(storedSession);

      // Check if session is still valid (less than 1 hour old for demo)
      if (Date.now() - currentSession.timestamp > 3600000) {
        console.log("Session expired, clearing");
        localStorage.removeItem("bsky_session");
        currentSession = null;
        showLoginForm();
        return;
      }

      window.currentSession = currentSession;
      window.userId = currentSession.did;
      window.userHandle = currentSession.handle;
      window.accessToken = currentSession.accessToken;
      showUserInfo(currentSession.handle);
    } catch (e) {
      console.error("Failed to restore session:", e);
      localStorage.removeItem("bsky_session");
      showLoginForm();
    }
  } else {
    showLoginForm();
  }
}

function showLoginForm() {
  const loginForm = document.getElementById("login-form");
  const userInfo = document.getElementById("user-info");
  if (loginForm) loginForm.style.display = "flex";
  if (userInfo) userInfo.style.display = "none";

  // Hide "Your Messages" section and pdsls link
  const yourMessagesSection = document.getElementById("your-messages-section");
  if (yourMessagesSection) yourMessagesSection.style.display = "none";
  const pdslsLink = document.getElementById("pdsls-link");
  if (pdslsLink) pdslsLink.style.display = "none";

  // disable camera and message sections
  disableInteractions();
}

function showUserInfo(handle) {
  const loginForm = document.getElementById("login-form");
  const userInfo = document.getElementById("user-info");
  const userHandle = document.getElementById("user-handle");
  if (loginForm) loginForm.style.display = "none";
  if (userInfo) userInfo.style.display = "flex";
  if (userHandle) userHandle.textContent = "@" + handle;

  // enable camera and message sections
  enableInteractions();

  // Show "Your Messages" section and load posts
  const yourMessagesSection = document.getElementById("your-messages-section");
  if (yourMessagesSection) yourMessagesSection.style.display = "block";
  loadYourMessages();

  // Show pdsls.dev link with user's DID
  const pdslsLink = document.getElementById("pdsls-link");
  if (pdslsLink && currentSession?.did) {
    pdslsLink.href = `https://pdsls.dev/at://${currentSession.did}`;
    pdslsLink.style.display = "inline";
  }
}

function disableInteractions() {
  const cameraSection = document.getElementById("camera-section");
  const messageSection = document.getElementById("message-section");
  const startCamera = document.getElementById("start-camera");
  const messageText = document.getElementById("message-text");
  const postToBluesky = document.getElementById("post-to-bluesky");
  const expiresIn = document.getElementById("expires-in");

  if (cameraSection) cameraSection.classList.add("disabled");
  if (messageSection) messageSection.classList.add("disabled");
  if (startCamera) startCamera.disabled = true;
  if (messageText) messageText.disabled = true;
  if (postToBluesky) postToBluesky.disabled = true;
  if (expiresIn) expiresIn.disabled = true;
}

function enableInteractions() {
  const cameraSection = document.getElementById("camera-section");
  const messageSection = document.getElementById("message-section");
  const startCamera = document.getElementById("start-camera");
  const messageText = document.getElementById("message-text");
  const postToBluesky = document.getElementById("post-to-bluesky");
  const expiresIn = document.getElementById("expires-in");

  if (cameraSection) cameraSection.classList.remove("disabled");
  if (messageSection) messageSection.classList.remove("disabled");
  if (startCamera) startCamera.disabled = false;
  if (messageText) messageText.disabled = false;
  if (postToBluesky) postToBluesky.disabled = false;
  if (expiresIn) expiresIn.disabled = false;
}

async function handleLogin() {
  const handleInput = document.getElementById("bluesky-handle");
  const handle = handleInput?.value.trim();

  if (!handle) {
    alert("Please enter your Bluesky handle");
    return;
  }

  // Redirect to server OAuth endpoint
  window.location.href = `/oauth/login?handle=${encodeURIComponent(handle)}`;
}

async function handleLogout() {
  if (currentSession) {
    localStorage.removeItem("bsky_session");
    currentSession = null;
    window.currentSession = null;
    window.userId = null;
    window.userHandle = null;
    window.accessToken = null;

    // stop camera if active
    const videoPreview = document.getElementById("video-preview");
    if (videoPreview && videoPreview.srcObject) {
      videoPreview.srcObject.getTracks().forEach((track) => track.stop());
      videoPreview.srcObject = null;
    }

    showLoginForm();
  }
}

// Global function to post message to the custom lexicon (and optionally Bluesky)
window.postMessage = async function (text, gifDataUrl, options = {}) {
  if (!currentSession || !currentSession.sessionId) {
    console.error("No valid session available");
    return { success: false, error: "Not authenticated" };
  }

  try {
    const response = await fetch("/api/message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: currentSession.sessionId,
        text,
        gifDataUrl,
        postToBsky: options.postToBsky || false,
        expiresIn: options.expiresIn || null,
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log("Posted message successfully!", result);
      return result;
    } else {
      console.error("Failed to post:", result.error);

      // If session expired, log out
      if (
        result.error?.includes("session") ||
        result.error?.includes("expired")
      ) {
        alert("Session expired. Please log in again.");
        handleLogout();
      }

      return result;
    }
  } catch (error) {
    console.error("Error posting message:", error);
    return { success: false, error: error.message };
  }
};

// Keep the old function name for backward compatibility
window.postToBluesky = window.postMessage;

// Load user's messages from their PDS
async function loadYourMessages() {
  if (!currentSession?.sessionId) return;

  const container = document.getElementById("your-messages-container");
  if (!container) return;

  container.innerHTML =
    '<p class="loading-your-messages">Loading your messages...</p>';

  try {
    const response = await fetch(
      `/api/my-posts?sessionId=${encodeURIComponent(currentSession.sessionId)}`,
    );
    const result = await response.json();

    if (result.error) {
      container.innerHTML = `<p class="loading-your-messages">Error: ${result.error}</p>`;
      return;
    }

    if (!result.posts || result.posts.length === 0) {
      container.innerHTML =
        '<p class="loading-your-messages">No messages yet. Post something!</p>';
      return;
    }

    container.innerHTML = "";
    for (const post of result.posts) {
      const messageEl = document.createElement("div");
      messageEl.className = "message";
      messageEl.setAttribute("data-rkey", post.rkey);

      const expiresInfo = post.expiresAt
        ? `<span class="expires-info" title="Expires ${new Date(post.expiresAt).toLocaleString()}">⏰</span>`
        : "";

      const bskyLink = post.blueskyPostUri
        ? `<a href="https://bsky.app/profile/${currentSession.handle}/post/${post.blueskyPostUri.split("/").pop()}" target="_blank" class="bsky-link" title="View on Bluesky">🦋</a>`
        : "";

      messageEl.innerHTML = `
        <div class="message-content">
          <div class="message-text">${escapeHtml(post.text)}</div>
          <div class="message-meta">
            <span class="message-time">${new Date(post.createdAt).toLocaleString()}</span>
            ${expiresInfo}
            ${bskyLink}
            <button class="delete-btn" onclick="deleteYourMessage('${post.rkey}')" title="Delete message">🗑️</button>
          </div>
        </div>
      `;
      container.appendChild(messageEl);
    }
  } catch (error) {
    console.error("Error loading your messages:", error);
    container.innerHTML =
      '<p class="loading-your-messages">Failed to load messages.</p>';
  }
}

// Delete a message from user's PDS
window.deleteYourMessage = async function (rkey) {
  if (!currentSession?.sessionId) return;

  if (!confirm("Delete this message? This will remove it from your PDS.")) {
    return;
  }

  try {
    const response = await fetch(
      `/api/message/${rkey}?sessionId=${encodeURIComponent(currentSession.sessionId)}`,
      {
        method: "DELETE",
      },
    );
    const result = await response.json();

    if (result.success) {
      // Remove from "Your Messages" section
      const yourContainer = document.getElementById("your-messages-container");
      const yourMessageEl = yourContainer?.querySelector(
        `[data-rkey="${rkey}"]`,
      );
      if (yourMessageEl) yourMessageEl.remove();

      // Also remove from "Recent Messages" if present
      const recentContainer = document.getElementById("messages-container");
      const recentMessageEl = recentContainer?.querySelector(
        `[data-message-id="${rkey}"]`,
      );
      if (recentMessageEl) recentMessageEl.remove();

      console.log("Message deleted:", rkey);
    } else {
      alert("Failed to delete: " + result.error);
    }
  } catch (error) {
    console.error("Error deleting message:", error);
    alert("Failed to delete message.");
  }
};

// Helper to escape HTML
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

// Set up event listeners
document.addEventListener("DOMContentLoaded", () => {
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");
  const handleInput = document.getElementById("bluesky-handle");

  if (loginButton) {
    loginButton.addEventListener("click", handleLogin);
  }
  if (logoutButton) {
    logoutButton.addEventListener("click", handleLogout);
  }
  if (handleInput) {
    handleInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        handleLogin();
      }
    });
  }

  initAuth();
});
