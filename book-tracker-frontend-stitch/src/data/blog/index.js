import goodreadsAlternative from './goodreads-alternative.js'
import bestBookTrackerApps from './best-book-tracker-apps.js'
import howToTrackReadingProgress from './how-to-track-reading-progress.js'
import howToBuildReadingHabit from './how-to-build-reading-habit.js'
import bestReadingChallengeApps from './best-reading-challenge-apps.js'

export const POSTS = [
  goodreadsAlternative,
  bestBookTrackerApps,
  howToTrackReadingProgress,
  howToBuildReadingHabit,
  bestReadingChallengeApps,
].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))

export function getPostBySlug(slug) {
  return POSTS.find((p) => p.slug === slug) ?? null
}
