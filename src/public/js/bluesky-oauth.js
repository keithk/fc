// Browser OAuth client for Bluesky
// This runs in the browser, not on the server

let oauthClient = null
let currentSession = null

// Initialize OAuth client
async function initOAuthClient() {
  try {
    // For development on 127.0.0.1
    const clientId = 'http://127.0.0.1:3891/oauth-client-metadata.json'
    const redirectUri = 'http://127.0.0.1:3891/oauth/callback'

    // Import the browser OAuth client
    const { BrowserOAuthClient } = await import('@atproto/oauth-client-browser')

    oauthClient = new BrowserOAuthClient({
      clientId,
      // Use the loopback flow for development
      responseMode: 'query',
      plcDirectoryUrl: 'https://plc.directory',
      // Minimal handle resolver for development
      handleResolver: async (handle) => {
        // Simple resolver that works with bsky.social handles
        const normalizedHandle = handle.replace('@', '')

        // Check if it's a did:plc
        if (normalizedHandle.startsWith('did:')) {
          return normalizedHandle
        }

        // Try to resolve via well-known
        try {
          const response = await fetch(`https://${normalizedHandle}/.well-known/atproto-did`)
          if (response.ok) {
            const did = await response.text()
            return did.trim()
          }
        } catch (e) {
          console.log('Failed to resolve via well-known')
        }

        // Fallback: try common patterns
        if (!normalizedHandle.includes('.')) {
          // Try adding .bsky.social
          return initOAuthClient.handleResolver(`${normalizedHandle}.bsky.social`)
        }

        throw new Error(`Could not resolve handle: ${handle}`)
      }
    })

    // Try to restore existing session
    const result = await oauthClient.init()
    if (result?.session) {
      currentSession = result.session
      console.log('Restored session for:', currentSession.did)
      return currentSession
    }

    return null
  } catch (error) {
    console.error('Failed to initialize OAuth client:', error)
    throw error
  }
}

// Sign in with Bluesky
async function signInWithBluesky(handle) {
  if (!oauthClient) {
    await initOAuthClient()
  }

  try {
    // Normalize handle
    const normalizedHandle = handle.includes('.') ? handle : `${handle}.bsky.social`

    console.log('Starting OAuth flow for:', normalizedHandle)

    // This will redirect to Bluesky for authorization
    await oauthClient.signIn(normalizedHandle, {
      state: crypto.randomUUID(),
      prompt: 'consent'
    })
  } catch (error) {
    console.error('Sign in failed:', error)
    throw error
  }
}

// Handle OAuth callback
async function handleOAuthCallback() {
  if (!oauthClient) {
    await initOAuthClient()
  }

  try {
    // Check if we're on the callback page
    const params = new URLSearchParams(window.location.search)
    if (!params.has('code') && !params.has('error')) {
      return null
    }

    // The client will handle the callback automatically on init
    const result = await oauthClient.init()
    if (result?.session) {
      currentSession = result.session
      console.log('OAuth callback successful:', currentSession.did)

      // Clean up the URL
      window.history.replaceState({}, document.title, '/')

      return currentSession
    }

    return null
  } catch (error) {
    console.error('OAuth callback failed:', error)
    throw error
  }
}

// Get current session
function getCurrentSession() {
  return currentSession
}

// Sign out
async function signOut() {
  if (oauthClient && currentSession) {
    try {
      // Revoke tokens
      await currentSession.signOut()
      currentSession = null
      console.log('Signed out successfully')
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }
}

// Export for use in other scripts
window.BlueskyOAuth = {
  init: initOAuthClient,
  signIn: signInWithBluesky,
  handleCallback: handleOAuthCallback,
  getSession: getCurrentSession,
  signOut: signOut
}