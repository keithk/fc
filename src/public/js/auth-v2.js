// OAuth and Bluesky posting functionality

// Load config from global scope - will be set by the server
// If not set, use the current window location to build the config
const currentOrigin = window.location.origin;
const OAUTH_CONFIG = window.OAUTH_CONFIG || {
  clientId: `${currentOrigin}/oauth-client-metadata.json`,
  redirectUri: `${currentOrigin}/oauth/callback`,
  scopes: "atproto app.bsky.feed.post com.atproto.repo.uploadBlob",
};

let currentSession = null;

async function handleOAuthCallback() {
  // This will be called from the server's callback page
  const params = new URLSearchParams(window.location.search);
  const session = params.get("session");

  if (session) {
    try {
      const sessionData = JSON.parse(decodeURIComponent(session));
      localStorage.setItem("bsky_session", JSON.stringify(sessionData));
      window.location.href = "/"; // Redirect to main page
    } catch (e) {
      console.error("Failed to process session:", e);
      alert("Login failed");
      window.location.href = "/";
    }
  }
}

async function initAuth() {
  try {
    // Check if this is the OAuth callback page
    if (window.location.pathname === "/oauth/callback") {
      await handleOAuthCallback();
      return;
    }

    // Check if we have a stored session
    const storedSession = localStorage.getItem("bsky_session");
    if (storedSession) {
      try {
        const sessionData = JSON.parse(storedSession);
        currentSession = sessionData;
        window.currentSession = sessionData;
        window.userId = sessionData.did;
        window.userHandle = sessionData.handle;
        showUserInfo(sessionData.handle || sessionData.did);
        return;
      } catch (e) {
        console.error("Failed to restore session:", e);
        localStorage.removeItem("bsky_session");
      }
    }

    // No session found, show login form
    showLoginForm();
  } catch (error) {
    console.error("Auth init failed:", error);
    showLoginForm();
  }
}

function showLoginForm() {
  const loginForm = document.getElementById("login-form");
  const userInfo = document.getElementById("user-info");
  if (loginForm) loginForm.style.display = "flex";
  if (userInfo) userInfo.style.display = "none";
}

function showUserInfo(handle) {
  const loginForm = document.getElementById("login-form");
  const userInfo = document.getElementById("user-info");
  const userHandle = document.getElementById("user-handle");
  if (loginForm) loginForm.style.display = "none";
  if (userInfo) userInfo.style.display = "flex";
  if (userHandle)
    userHandle.textContent = handle.startsWith("did:")
      ? handle.substring(0, 15) + "..."
      : "@" + handle;
}

async function handleLogin() {
  console.log("handleLogin called");
  const handleInput = document.getElementById("bluesky-handle");
  const handle = handleInput?.value.trim();
  console.log("Handle input value:", handle);

  if (!handle) {
    alert("Please enter your Bluesky handle");
    return;
  }

  const normalizedHandle = handle.includes(".")
    ? handle
    : handle + ".bsky.social";

  try {
    console.log("Starting sign in for:", normalizedHandle);

    // Resolve the handle to get the DID
    let did;
    try {
      const response = await fetch(
        "https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=" +
          encodeURIComponent(normalizedHandle),
      );
      if (response.ok) {
        const data = await response.json();
        did = data.did;
      }
    } catch (e) {
      console.error("Failed to resolve handle:", e);
      alert("Could not find handle: " + normalizedHandle);
      return;
    }

    // Store handle and initiate OAuth flow
    sessionStorage.setItem("pending_handle", normalizedHandle);
    sessionStorage.setItem("pending_did", did);

    // Redirect to server OAuth endpoint to initiate the flow
    window.location.href = `/oauth/login?handle=${encodeURIComponent(normalizedHandle)}`;
  } catch (error) {
    console.error("Login failed:", error);
    alert("Login failed: " + error.message);
  }
}

async function handleLogout() {
  if (currentSession) {
    try {
      await currentSession.signOut();
      currentSession = null;
      window.userId = null;
      window.userHandle = null;
      window.currentSession = null;
      showLoginForm();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }
}

// Global function to save to custom lexicon
window.saveToFaceChat = async function (text, gifDataUrl) {
  // Custom lexicon support would require implementing the raw API calls
  // For now, we'll skip this feature and focus on posting to Bluesky
  console.log("Custom lexicon support not yet implemented");
  return { success: false, error: "Custom lexicon not implemented" };
};

// Global function to post to Bluesky
window.postToBluesky = async function (text, gifDataUrl) {
  if (!window.currentSession) {
    console.error("No session available");
    return { success: false, error: "Not authenticated" };
  }

  try {
    // Import Agent from atproto API
    const { Agent } = await import("https://esm.sh/@atproto/api@0.13.14");

    // Create an agent with the current session
    const agent = new Agent(window.currentSession);

    // Get the PDS URL from the session
    const pdsUrl = window.pdsUrl || window.currentSession.server.issuer;
    console.log("Using PDS URL:", pdsUrl);

    let embed = undefined;

    // Upload the GIF if provided
    if (gifDataUrl) {
      const base64Data = gifDataUrl.split(",")[1];
      const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

      // Upload the blob using the agent
      const uploadResponse = await agent.uploadBlob(bytes, {
        encoding: "image/gif",
      });

      if (uploadResponse.success) {
        console.log("Blob uploaded:", uploadResponse.data.blob);

        // Create the embed structure as per Bluesky docs
        embed = {
          $type: "app.bsky.embed.images",
          images: [
            {
              alt: "Face Chat GIF",
              image: uploadResponse.data.blob,
              aspectRatio: {
                width: 200,
                height: 150,
              },
            },
          ],
        };
      } else {
        console.error("Failed to upload blob:", uploadResponse);
      }
    }

    // Create the post using the agent
    const postText = text + "\n\n🎥 via Face Chat";

    try {
      const postResponse = await agent.post({
        text: postText,
        embed: embed,
        langs: ["en"],
        createdAt: new Date().toISOString(),
      });

      if (postResponse) {
        console.log("Posted to Bluesky successfully!", postResponse);
        // Get the post URL
        const handle = window.userHandle || window.userId;
        const postId = postResponse.uri.split("/").pop();
        const postUrl = `https://bsky.app/profile/${handle}/post/${postId}`;
        console.log("View your post at:", postUrl);
        return { success: true, uri: postResponse.uri, url: postUrl };
      }
    } catch (postError) {
      console.error("Failed to post:", postError);
      return { success: false, error: postError.message };
    }
  } catch (error) {
    console.error("Error posting to Bluesky:", error);
    return { success: false, error: error.message };
  }
};

// Set up event listeners
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, setting up event listeners");
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");
  const handleInput = document.getElementById("bluesky-handle");

  console.log("Login button found:", loginButton);

  if (loginButton) {
    loginButton.addEventListener("click", () => {
      console.log("Login button clicked");
      handleLogin();
    });
  }
  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      console.log("Logout button clicked");
      handleLogout();
    });
  }
  if (handleInput) {
    handleInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        console.log("Enter key pressed");
        handleLogin();
      }
    });
  }

  console.log("Initializing auth...");
  initAuth();
});
