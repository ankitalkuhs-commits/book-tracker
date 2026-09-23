// Sprint 4F R-04 — the bot label on Android.
//
// This is NOT a new visual element: it is the Mutual / Follows-you pill that
// FeedScreen already draws in its user-search rows. The two style objects that
// pill is made of live here (`userBadge` / `userBadgeText`), and FeedScreen's
// StyleSheet keeps its `userBadge` / `userBadgeText` keys by pointing at them,
// so there is exactly one definition of the pill in the app and this file
// declares no StyleSheet of its own.
//
// Renders null when the author is not a bot, so every call site is
// unconditional and a reader's card gains no whitespace (spec R-04).
import { View, Text } from 'react-native';
import { colors, type } from '../theme';

export const userBadge = {
  backgroundColor: colors.tertiaryContainer,
  paddingHorizontal: 8,
  paddingVertical: 2,
  borderRadius: 10,
  marginRight: 4,
};

export const userBadgeText = {
  ...type.eyebrow,
  color: colors.tertiary,
  textTransform: 'none',
  letterSpacing: 0,
};

export default function BotBadge({ isBot }) {
  if (!isBot) return null;
  return (
    <View style={userBadge}>
      <Text style={userBadgeText}>BOT</Text>
    </View>
  );
}
