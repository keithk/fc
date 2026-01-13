// ABOUTME: Shared OAuth session storage
// ABOUTME: Stores active ATProto OAuth sessions for server-side API calls

// Active OAuth sessions (in-memory, lost on restart)
const activeSessions = new Map<string, any>();

export function getActiveSession(sessionId: string) {
  return activeSessions.get(sessionId);
}

export function setActiveSession(sessionId: string, session: any) {
  activeSessions.set(sessionId, session);
}

export function deleteActiveSession(sessionId: string) {
  activeSessions.delete(sessionId);
}

export function getAllActiveSessions(): Map<string, any> {
  return activeSessions;
}
