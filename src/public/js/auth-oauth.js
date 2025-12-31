// OAuth-based authentication for Face Chat
// Works with public URLs using server-side OAuth flow

let currentSession = null

async function initAuth() {
  // Check for stored session
  const storedSession = localStorage.getItem('bsky_session')
  if (storedSession) {
    try {
      currentSession = JSON.parse(storedSession)

      // Check if session is still valid (less than 1 hour old for demo)
      if (Date.now() - currentSession.timestamp > 3600000) {
        console.log('Session expired, clearing')
        localStorage.removeItem('bsky_session')
        currentSession = null
        showLoginForm()
        return
      }

      window.currentSession = currentSession
      window.userId = currentSession.did
      window.userHandle = currentSession.handle
      window.accessToken = currentSession.accessToken
      showUserInfo(currentSession.handle)
    } catch (e) {
      console.error('Failed to restore session:', e)
      localStorage.removeItem('bsky_session')
      showLoginForm()
    }
  } else {
    showLoginForm()
  }
}

function showLoginForm() {
  const loginForm = document.getElementById('login-form')
  const userInfo = document.getElementById('user-info')
  if (loginForm) loginForm.style.display = 'flex'
  if (userInfo) userInfo.style.display = 'none'

  // disable camera and message sections
  disableInteractions()
}

function showUserInfo(handle) {
  const loginForm = document.getElementById('login-form')
  const userInfo = document.getElementById('user-info')
  const userHandle = document.getElementById('user-handle')
  if (loginForm) loginForm.style.display = 'none'
  if (userInfo) userInfo.style.display = 'flex'
  if (userHandle) userHandle.textContent = '@' + handle

  // enable camera and message sections
  enableInteractions()
}

function disableInteractions() {
  const cameraSection = document.getElementById('camera-section')
  const messageSection = document.getElementById('message-section')
  const startCamera = document.getElementById('start-camera')
  const messageText = document.getElementById('message-text')
  const postToBluesky = document.getElementById('post-to-bluesky')

  if (cameraSection) cameraSection.classList.add('disabled')
  if (messageSection) messageSection.classList.add('disabled')
  if (startCamera) startCamera.disabled = true
  if (messageText) messageText.disabled = true
  if (postToBluesky) postToBluesky.disabled = true
}

function enableInteractions() {
  const cameraSection = document.getElementById('camera-section')
  const messageSection = document.getElementById('message-section')
  const startCamera = document.getElementById('start-camera')
  const messageText = document.getElementById('message-text')
  const postToBluesky = document.getElementById('post-to-bluesky')

  if (cameraSection) cameraSection.classList.remove('disabled')
  if (messageSection) messageSection.classList.remove('disabled')
  if (startCamera) startCamera.disabled = false
  if (messageText) messageText.disabled = false
  if (postToBluesky) postToBluesky.disabled = false
}

async function handleLogin() {
  const handleInput = document.getElementById('bluesky-handle')
  const handle = handleInput?.value.trim()

  if (!handle) {
    alert('Please enter your Bluesky handle')
    return
  }

  // Redirect to server OAuth endpoint
  window.location.href = `/oauth/login?handle=${encodeURIComponent(handle)}`
}

async function handleLogout() {
  if (currentSession) {
    localStorage.removeItem('bsky_session')
    currentSession = null
    window.currentSession = null
    window.userId = null
    window.userHandle = null
    window.accessToken = null

    // stop camera if active
    const videoPreview = document.getElementById('video-preview')
    if (videoPreview && videoPreview.srcObject) {
      videoPreview.srcObject.getTracks().forEach(track => track.stop())
      videoPreview.srcObject = null
    }

    showLoginForm()
  }
}

// Global function to post to Bluesky (via server-side OAuth)
window.postToBluesky = async function(text, gifDataUrl) {
  if (!currentSession || !currentSession.sessionId) {
    console.error('No valid session available')
    return { success: false, error: 'Not authenticated' }
  }

  try {
    // Post via server endpoint which handles OAuth authentication
    const response = await fetch('/oauth/post-to-bluesky', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: currentSession.sessionId,
        text,
        gifDataUrl
      })
    })

    const result = await response.json()

    if (result.success) {
      console.log('Posted to Bluesky successfully!', result)
      return result
    } else {
      console.error('Failed to post:', result.error)

      // If session expired, log out
      if (result.error?.includes('session') || result.error?.includes('expired')) {
        alert('Session expired. Please log in again.')
        handleLogout()
      }

      return result
    }
  } catch (error) {
    console.error('Error posting to Bluesky:', error)
    return { success: false, error: error.message }
  }
}


// Set up event listeners
document.addEventListener('DOMContentLoaded', () => {
  const loginButton = document.getElementById('login-button')
  const logoutButton = document.getElementById('logout-button')
  const handleInput = document.getElementById('bluesky-handle')

  if (loginButton) {
    loginButton.addEventListener('click', handleLogin)
  }
  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout)
  }
  if (handleInput) {
    handleInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleLogin()
      }
    })
  }

  initAuth()
})