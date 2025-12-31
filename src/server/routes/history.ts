/**
 * history api routes (currently unused)
 * placeholder for potential future per-user message history
 */

import { Elysia } from 'elysia'

export const historyRoutes = new Elysia({ prefix: '/api/history' })
  .get('/', () => {
    return {
      history: []
    }
  })
  .delete('/:id', ({ params }) => {
    return {
      success: true,
      message: `delete endpoint for ${params.id}`
    }
  })