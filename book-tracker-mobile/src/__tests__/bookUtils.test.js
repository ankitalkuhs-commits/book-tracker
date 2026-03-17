/**
 * Tests for shared book utility functions.
 * Run: npm test
 */
import {
  formatTimeAgo,
  getStatusLabel,
  getStatusColor,
  calcProgressPercent,
} from '../utils/bookUtils';

// ─── formatTimeAgo ───────────────────────────────────────────────────────────

describe('formatTimeAgo', () => {
  const now = new Date('2026-03-14T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns "Just now" for timestamps less than 1 minute ago', () => {
    const timestamp = new Date(now.getTime() - 30_000).toISOString(); // 30s ago
    expect(formatTimeAgo(timestamp)).toBe('Just now');
  });

  test('returns minutes for timestamps 1–59 minutes ago', () => {
    const timestamp = new Date(now.getTime() - 15 * 60_000).toISOString(); // 15 min ago
    expect(formatTimeAgo(timestamp)).toBe('15m ago');
  });

  test('returns hours for timestamps 1–23 hours ago', () => {
    const timestamp = new Date(now.getTime() - 3 * 3_600_000).toISOString(); // 3h ago
    expect(formatTimeAgo(timestamp)).toBe('3h ago');
  });

  test('returns days for timestamps 1–6 days ago', () => {
    const timestamp = new Date(now.getTime() - 2 * 86_400_000).toISOString(); // 2 days ago
    expect(formatTimeAgo(timestamp)).toBe('2d ago');
  });

  test('returns locale date string for timestamps older than 7 days', () => {
    const old = new Date(now.getTime() - 10 * 86_400_000); // 10 days ago
    const result = formatTimeAgo(old.toISOString());
    expect(result).toBe(old.toLocaleDateString());
  });

  test('returns empty string for null/undefined', () => {
    expect(formatTimeAgo(null)).toBe('');
    expect(formatTimeAgo(undefined)).toBe('');
  });
});

// ─── getStatusLabel ──────────────────────────────────────────────────────────

describe('getStatusLabel', () => {
  test('returns "Reading" for "reading"', () => {
    expect(getStatusLabel('reading')).toBe('Reading');
  });

  test('returns "Finished" for "finished"', () => {
    expect(getStatusLabel('finished')).toBe('Finished');
  });

  test('returns "To Read" for "to-read"', () => {
    expect(getStatusLabel('to-read')).toBe('To Read');
  });

  test('returns the raw value for unknown statuses', () => {
    expect(getStatusLabel('completed')).toBe('completed');
  });

  test('handles null/undefined gracefully', () => {
    expect(getStatusLabel(null)).toBe('Unknown');
    expect(getStatusLabel(undefined)).toBe('Unknown');
  });
});

// ─── getStatusColor ──────────────────────────────────────────────────────────

describe('getStatusColor', () => {
  test('returns green for "reading"', () => {
    expect(getStatusColor('reading')).toBe('#4CAF50');
  });

  test('returns blue for "finished"', () => {
    expect(getStatusColor('finished')).toBe('#2196F3');
  });

  test('returns orange for "to-read"', () => {
    expect(getStatusColor('to-read')).toBe('#FF9800');
  });

  test('returns grey for unknown status', () => {
    expect(getStatusColor('unknown')).toBe('#999');
  });
});

// ─── calcProgressPercent ─────────────────────────────────────────────────────

describe('calcProgressPercent', () => {
  test('calculates percentage correctly', () => {
    expect(calcProgressPercent(50, 100)).toBe(50);
    expect(calcProgressPercent(1, 4)).toBe(25);
    expect(calcProgressPercent(300, 400)).toBe(75);
  });

  test('rounds to nearest integer', () => {
    expect(calcProgressPercent(1, 3)).toBe(33); // 33.33... → 33
  });

  test('caps at 100 even if currentPage > totalPages', () => {
    expect(calcProgressPercent(500, 400)).toBe(100);
  });

  test('returns 0 when totalPages is 0 or missing', () => {
    expect(calcProgressPercent(50, 0)).toBe(0);
    expect(calcProgressPercent(50, null)).toBe(0);
    expect(calcProgressPercent(50, undefined)).toBe(0);
  });

  test('handles empty string for currentPage (NaN guard)', () => {
    // Old bug: parseInt('') = NaN → NaN% width on progress bar
    expect(calcProgressPercent('', 100)).toBe(0);
  });

  test('handles string currentPage', () => {
    expect(calcProgressPercent('75', 100)).toBe(75);
  });

  test('returns 0 when currentPage is 0', () => {
    expect(calcProgressPercent(0, 200)).toBe(0);
  });
});
