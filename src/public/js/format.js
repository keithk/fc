// Small formatting helpers shared by the components

export function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTimeLeft(expiresAt) {
  const minutes = Math.floor((new Date(expiresAt) - Date.now()) / 60000);
  if (minutes < 1) return "any second now";
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `in ${hours}h ${minutes % 60}m` : `in ${minutes}m`;
}

export function rkeyOf(uri) {
  return uri.split("/").pop();
}
