// Simplified Bluesky authentication for development
// In production, use proper OAuth flow

import { AtpAgent } from '@atproto/api'

export class SimpleBlueskyAuth {
  private agent: AtpAgent

  constructor() {
    this.agent = new AtpAgent({
      service: 'https://bsky.social'
    })
  }

  async login(identifier: string, password: string) {
    try {
      const response = await this.agent.login({
        identifier,
        password
      })

      return {
        success: true,
        did: response.data.did,
        handle: response.data.handle,
        accessJwt: response.data.accessJwt,
        refreshJwt: response.data.refreshJwt
      }
    } catch (error) {
      console.error('Login failed:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  async verifySession(accessJwt: string) {
    try {
      this.agent.resumeSession({
        accessJwt,
        refreshJwt: '',
        did: '',
        handle: ''
      })

      const session = await this.agent.getSession()
      return session
    } catch (error) {
      console.error('Session verification failed:', error)
      return null
    }
  }
}