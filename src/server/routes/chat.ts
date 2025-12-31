/**
 * chat api routes (currently unused - websocket handles all chat)
 * these are placeholder endpoints for potential future rest api usage
 */

import { Elysia } from 'elysia'

export const chatRoutes = new Elysia({ prefix: '/api/chat' })
  .post('/send', async () => {
    return {
      success: true,
      message: 'use websocket for chat'
    }
  })
  .get('/recent', () => {
    return {
      messages: []
    }
  })