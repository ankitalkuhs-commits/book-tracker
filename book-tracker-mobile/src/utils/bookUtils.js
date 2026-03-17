/**
 * Formats a timestamp into a human-readable relative time string.
 * @param {string|Date} timestamp
 * @returns {string}
 */
export function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const now = new Date();
  const postDate = new Date(timestamp);
  const diffMs = now - postDate;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return postDate.toLocaleDateString();
}

/**
 * Returns the display label for a reading status.
 * @param {string} status
 * @returns {string}
 */
export function getStatusLabel(status) {
  switch (status) {
    case 'reading': return 'Reading';
    case 'finished': return 'Finished';
    case 'to-read': return 'To Read';
    default: return status || 'Unknown';
  }
}

/**
 * Returns the display colour for a reading status.
 * @param {string} status
 * @returns {string}
 */
export function getStatusColor(status) {
  switch (status) {
    case 'reading': return '#4CAF50';
    case 'finished': return '#2196F3';
    case 'to-read': return '#FF9800';
    default: return '#999';
  }
}

/**
 * Calculates reading progress percentage, clamped 0–100.
 * @param {number|string} currentPage
 * @param {number} totalPages
 * @returns {number}
 */
export function calcProgressPercent(currentPage, totalPages) {
  if (!totalPages || totalPages <= 0) return 0;
  const page = parseInt(currentPage) || 0;
  return Math.min(Math.round((page / totalPages) * 100), 100);
}
