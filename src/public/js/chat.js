let ws = null
window.userId = null // Make it global so auth.js can update it
window.userHandle = null
window.currentSession = null

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

  ws.onopen = () => {
    console.log('Connected to Face Chat')
  }

  ws.onmessage = (event) => {
    console.log('WebSocket message received:', event.data)
    const data = JSON.parse(event.data)
    console.log('Parsed message type:', data.type)

    if (data.type === 'connected') {
      console.log('Connected, displaying messages:', data.messages)
      displayMessages(data.messages)
    } else if (data.type === 'new_message') {
      console.log('New message received:', data.message)
      displayMessage(data.message)
    }
  }

  ws.onclose = () => {
    console.log('Disconnected from Face Chat')
    setTimeout(connectWebSocket, 3000)
  }

  ws.onerror = (error) => {
    console.error('WebSocket error:', error)
  }
}

function displayMessages(messages) {
  const container = document.getElementById('messages-container')
  if (!container) return

  container.innerHTML = ''
  // Display messages in reverse order (newest first)
  const reversed = [...messages].reverse()
  reversed.forEach(msg => displayMessage(msg, true))
}

function displayMessage(message, skipPrepend = false) {
  const container = document.getElementById('messages-container')
  if (!container) {
    console.error('Messages container not found!')
    return
  }

  console.log('Displaying message:', message)

  const messageEl = document.createElement('div')
  messageEl.className = 'message'

  // Create handle link if available
  const handleLink = message.userHandle
    ? `<a href="https://bsky.app/profile/${message.userHandle}" target="_blank" class="message-handle">@${message.userHandle}</a>`
    : message.userId?.startsWith('did:')
      ? `<a href="https://bsky.app/profile/${message.userId}" target="_blank" class="message-did">@${message.userId.substring(8, 23)}...</a>`
      : ''

  // Determine if this is a video or image
  let mediaHtml = ''
  if (message.gif) {
    // Check if it's a video (data URL starts with data:video/)
    if (message.gif.startsWith('data:video/')) {
      mediaHtml = `<video src="${message.gif}" class="message-gif" autoplay loop muted playsinline></video>`
    } else {
      mediaHtml = `<img src="${message.gif}" class="message-gif" alt="User GIF">`
    }
  }

  const html = `
    ${mediaHtml}
    <div class="message-content">
      <div class="message-text">${escapeHtml(message.text)}</div>
      <div class="message-meta">
        ${handleLink}
        <span class="message-time">${formatTime(message.timestamp || Date.now())}</span>
      </div>
    </div>
  `

  messageEl.innerHTML = html

  // Add to beginning (newest first) unless we're loading initial messages
  if (skipPrepend) {
    container.appendChild(messageEl)
  } else {
    container.insertBefore(messageEl, container.firstChild)
  }

  while (container.children.length > 20) {
    container.removeChild(container.lastChild)
  }

  console.log('Message added to container')
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  }
  return text.replace(/[&<>"'/]/g, char => map[char])
}

function formatTime(timestamp) {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function sendMessage(text, gifDataUrl) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('WebSocket not connected')
    return false
  }

  const message = {
    type: 'chat',
    text: text,
    gif: gifDataUrl,
    userId: window.userId || 'anonymous',
    userHandle: window.userHandle || null
  }

  console.log('Sending message:', { text, hasGif: !!gifDataUrl })
  console.log('WebSocket state:', ws.readyState, 'OPEN=', WebSocket.OPEN)

  try {
    const messageString = JSON.stringify(message)
    console.log('Sending to WebSocket, message length:', messageString.length)
    ws.send(messageString)
    console.log('Message sent to WebSocket successfully')
    return true
  } catch (error) {
    console.error('Failed to send message:', error)
    return false
  }
}

document.addEventListener('DOMContentLoaded', () => {
  connectWebSocket()
})