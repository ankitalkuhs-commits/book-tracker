// Sprint 4I (P5) — the block confirmation, in one place because it is the same
// promise on every screen that offers Block.
//
// The copy is the decision here, not the Alert. A block is irreversible in two
// ways a reader will not guess, so the body says all three things before the
// tap (spec R-28, pm-decisions E-1 and E-8):
//
//   * the two of you stop seeing each other inside TrackMyRead;
//   * any follow in either direction is deleted and does NOT come back when
//     you unblock — unblocking restores nothing;
//   * it does NOT unpublish public posts. /notes/feed serves signed-out
//     callers and there is no viewer to filter for, so a blocked reader who
//     signs out still sees them on the web. The control for that is the
//     private-profile setting, not this.
//
// The three anchors above are asserted against the `en` value in
// __tests__/reportAffordance.test.mjs, so a rewrite that drops one is red.
import { Alert } from 'react-native';
import { userAPI } from '../services/api';

/**
 * Ask, then block. `onBlocked` runs only after the request succeeds.
 *
 * Cancel is FIRST and carries no onPress (the GroupDetailScreen handleReject
 * precedent, sourceRules.test.mjs::reject_requires_confirm_with_cancel_first):
 * the destructive button must never be the one a stray tap lands on.
 */
export function confirmBlock(t, { userId, name }, onBlocked) {
  if (!userId) return;
  Alert.alert(
    t('safety.blockTitle', { name }),
    t('safety.blockConfirmBody', { name }),
    [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('safety.blockAction'),
        style: 'destructive',
        onPress: async () => {
          try {
            await userAPI.blockUser(userId);
            onBlocked?.(userId);
          } catch (e) {
            Alert.alert(t('common.error'), e?.response?.data?.detail || t('safety.blockFailed'));
          }
        },
      },
    ],
  );
}
