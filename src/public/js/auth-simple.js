// Simple authentication using app passwords
// This is a temporary solution until OAuth is properly set up for public URLs

let currentSession = null

async function initAuth() {
  // Check for stored credentials
  const storedSession = localStorage.getItem('bsky_session')
  if (storedSession) {
    try {
      currentSession = JSON.parse(storedSession)
      window.currentSession = currentSession
      window.userId = currentSession.did
      window.userHandle = currentSession.handle
      window.pdsUrl = 'https://bsky.social'
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
}

function showUserInfo(handle) {
  const loginForm = document.getElementById('login-form')
  const userInfo = document.getElementById('user-info')
  const userHandle = document.getElementById('user-handle')
  if (loginForm) loginForm.style.display = 'none'
  if (userInfo) userInfo.style.display = 'flex'
  if (userHandle) userHandle.textContent = '@' + handle
}

async function handleLogin() {
  const handleInput = document.getElementById('bluesky-handle')
  const handle = handleInput?.value.trim()

  if (!handle) {
    alert('Please enter your Bluesky handle')
    return
  }

  const normalizedHandle = handle.includes('.') ? handle : handle + '.bsky.social'

  // Get app password from user
  const appPassword = prompt('Enter your Bluesky app password (create one at bsky.app/settings/app-passwords):')
  if (!appPassword) return

  try {
    // Create a session using app password
    const response = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        identifier: normalizedHandle,
        password: appPassword
      })
    })

    if (response.ok) {
      const session = await response.json()

      // Store session
      currentSession = {
        did: session.did,
        handle: session.handle,
        accessJwt: session.accessJwt,
        refreshJwt: session.refreshJwt
      }

      localStorage.setItem('bsky_session', JSON.stringify(currentSession))
      window.currentSession = currentSession
      window.userId = session.did
      window.userHandle = session.handle
      window.pdsUrl = 'https://bsky.social'

      showUserInfo(session.handle)
    } else {
      const error = await response.json()
      alert('Login failed: ' + error.message)
    }
  } catch (error) {
    console.error('Login failed:', error)
    alert('Login failed: ' + error.message)
  }
}

async function handleLogout() {
  if (currentSession) {
    localStorage.removeItem('bsky_session')
    currentSession = null
    window.currentSession = null
    window.userId = null
    window.userHandle = null
    showLoginForm()
  }
}

// Global function to post to Bluesky
window.postToBluesky = async function(text, gifDataUrl) {
  if (!currentSession || !currentSession.accessJwt) {
    console.error('No session available')
    return { success: false, error: 'Not authenticated' }
  }

  try {
    let embed = undefined

    // Upload the GIF if provided
    if (gifDataUrl) {
      const base64Data = gifDataUrl.split(',')[1]
      const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'image/gif' })

      // Upload the blob
      const uploadResponse = await fetch('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentSession.accessJwt}`,
          'Content-Type': 'image/gif'
        },
        body: blob
      })

      if (uploadResponse.ok) {
        const uploadData = await uploadResponse.json()
        console.log('Blob uploaded:', uploadData)

        // Create the embed structure
        embed = {
          $type: 'app.bsky.embed.images',
          images: [{
            alt: 'Face Chat GIF',
            image: uploadData.blob,
            aspectRatio: {
              width: 200,
              height: 150
            }
          }]
        }
      } else {
        console.error('Failed to upload blob:', await uploadResponse.text())
      }
    }

    // Create the post record
    const record = {
      $type: 'app.bsky.feed.post',
      text: text + '\n\n🎥 via Face Chat',
      createdAt: new Date().toISOString(),
      langs: ['en']
    }

    if (embed) {
      record.embed = embed
    }

    // Create the post
    const createResponse = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentSession.accessJwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        repo: currentSession.did,
        collection: 'app.bsky.feed.post',
        record: record
      })
    })

    if (createResponse.ok) {
      const data = await createResponse.json()
      console.log('Posted to Bluesky successfully!', data)
      const postId = data.uri.split('/').pop()
      const postUrl = `https://bsky.app/profile/${currentSession.handle}/post/${postId}`
      return { success: true, uri: data.uri, url: postUrl }
    } else {
      const error = await createResponse.text()
      console.error('Failed to post:', error)
      return { success: false, error }
    }
  } catch (error) {
    console.error('Error posting to Bluesky:', error)
    return { success: false, error: error.message }
  }
}

// Placeholder for custom lexicon
window.saveToFaceChat = async function(text, gifDataUrl) {
  console.log('Custom lexicon support not implemented')
  return { success: false, error: 'Custom lexicon not implemented' }
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