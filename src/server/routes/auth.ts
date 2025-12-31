/**
 * auth api routes (currently unused - oauth is client-side only)
 * these are placeholder endpoints for potential future server-side session management
 */

import { Elysia } from 'elysia'

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .get('/status', () => {
    return { authenticated: false }
  })
  .post('/logout', () => {
    return {
      success: true,
      message: 'logged out'
    }
  })