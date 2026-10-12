// Sprint 4I (P5) — the report dialog, shared by every surface that shows
// another reader's content (spec R-05).
//
// Three things about this file are decisions, not style:
//
//   1. REPORT_REASONS is the server's closed set, in the server's order. The
//      server rejects anything else with a 422, so a reason invented here is a
//      dead button. `__tests__/reportAffordance.test.mjs` reads
//      `app/routers/reports_router.py`'s own REASONS tuple at test time and
//      compares — the list is never re-typed from memory on either side.
//
//   2. "Also block this person" starts checked ONLY when the thing reported IS
//      a person (`target.type === 'user'`). This SUPERSEDES pm-decisions E-3,
//      which started it checked everywhere.
//
//      E-3's reasoning still holds for an account report: a report queues for
//      a human and changes nothing anyone else sees, so the block is the
//      reader's only relief in the moment. It does not hold for a note or a
//      comment. "spam", "hate" and "violence" judge a piece of CONTENT, while
//      a block is irreversible against the follow graph — `blocks_router.py`
//      deletes the follow both ways and unblocking restores none of it
//      (R-21). Pre-checking it there meant a reader who wanted one note
//      looked at silently and permanently lost a follow they valued.
//
//      The wire default stays False (an old client that does not know the
//      field must not start blocking people); the per-target default is this
//      client's decision and it is `blockDefault` below.
//
//   3. There is exactly ONE request (pm-decisions Q-3). `also_block` is a
//      field on POST /reports, and the server writes the report, the block row
//      and the teardown in one transaction. Splitting this into a report call
//      plus a block call re-opens the question "what if the block half fails",
//      which Q-3 answered by removing the second half. Do not add a second
//      call here.
import React, { useState } from 'react';
import {
  View, Text, Modal, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, ScrollView, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { userAPI } from '../services/api';
import { colors, radius, type } from '../theme';

// app/routers/reports_router.py REASONS — same members, same order.
export const REPORT_REASONS = ['spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'other'];

const DETAIL_MAX = 1000;   // models.Report.detail's max_length

export default function ReportDialog({ target, onClose, onDone }) {
  const { t } = useTranslation();
  // Sized per render, never frozen at module scope: the sheet is reviewed on
  // iPad (supportsTablet) and must not be a phone-shaped box there.
  const { width } = useWindowDimensions();
  const [reason, setReason] = useState(null);
  const [detail, setDetail] = useState('');
  // DERIVED below, not stored. A per-target default cannot live in `useState`:
  // this sheet is ONE instance reused for every target (see `close`), and a
  // useState initial value is read once, at first mount. It cannot live in
  // `close` either, which runs while `target` is still the OLD one.
  // `blockOverride` therefore holds only what the reader actually tapped, and
  // null means untouched.
  const [blockOverride, setBlockOverride] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const visible = !!target;
  const name = target?.name || t('safety.thisReader');
  // A reader cannot block a note or a comment, only its author. When the
  // author is unknown the checkbox has nothing to act on, so it is not shown
  // and no `also_block: true` is sent for it.
  const canBlock = !!target?.userId;
  // Checked for an account report, unchecked for content — see header note 2.
  const blockDefault = target?.type === 'user';
  const alsoBlock = blockOverride ?? blockDefault;

  // `submitting` is reset HERE and not only in the error path. The sheet is one
  // instance reused for every target, so a successful report that left
  // `submitting` true would open the next one with the Send button disabled and
  // a spinner on it, for ever.
  const close = () => {
    setReason(null); setDetail(''); setBlockOverride(null); setError(null); setSubmitting(false);
    onClose?.();
  };

  const submit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await userAPI.reportContent({
        targetType: target.type,
        targetId: target.id,
        reason,
        detail: detail.trim(),
        alsoBlock: canBlock && alsoBlock,
      });
      const blocked = canBlock && alsoBlock;
      close();
      onDone?.({ blocked, userId: target.userId });
    } catch (e) {
      setError(e?.response?.data?.detail || t('safety.reportFailed'));
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { maxWidth: Math.min(width - 24, 520) }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('safety.reportTitle')}</Text>
            <TouchableOpacity
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.close')}
            >
              <Ionicons name="close" size={22} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>{t('safety.reportSubtitle')}</Text>

          <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.reasonRow, reason === r && styles.reasonRowActive]}
                onPress={() => setReason(r)}
                accessibilityRole="radio"
                accessibilityState={{ selected: reason === r }}
              >
                <Ionicons
                  name={reason === r ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={reason === r ? colors.primary : colors.outline}
                />
                <Text style={styles.reasonText}>{t(`safety.reasons.${r}`)}</Text>
              </TouchableOpacity>
            ))}

            <TextInput
              style={styles.detail}
              placeholder={t('safety.detailPlaceholder')}
              placeholderTextColor={colors.outline}
              value={detail}
              onChangeText={setDetail}
              multiline
              maxLength={DETAIL_MAX}
            />

            {canBlock && (
              <TouchableOpacity
                style={styles.checkRow}
                onPress={() => setBlockOverride(!alsoBlock)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: alsoBlock }}
                accessibilityLabel={t('a11y.alsoBlock')}
              >
                <Ionicons
                  name={alsoBlock ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={alsoBlock ? colors.primary : colors.outline}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkLabel}>{t('safety.alsoBlock', { name })}</Text>
                  <Text style={styles.checkHint}>{t('safety.alsoBlockHint')}</Text>
                </View>
              </TouchableOpacity>
            )}
          </ScrollView>

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.submit, (!reason || submitting) && { opacity: 0.45 }]}
            onPress={submit}
            disabled={!reason || submitting}
          >
            {submitting
              ? <ActivityIndicator size="small" color={colors.onPrimary} />
              : <Text style={styles.submitText}>{t('safety.sendReport')}</Text>}
          </TouchableOpacity>
          <Text style={styles.footnote}>{t('safety.reviewPromise')}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: {
    width: '100%', alignSelf: 'center',
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: 20, paddingBottom: 28,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.title, color: colors.onSurface },
  subtitle: { ...type.body, color: colors.onSurfaceVariant, marginTop: 4, marginBottom: 12 },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 12,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.outlineVariant,
    marginBottom: 8,
  },
  reasonRowActive: { borderColor: colors.primary, backgroundColor: colors.surfaceContainerLow },
  reasonText: { ...type.body, color: colors.onSurface, flex: 1 },
  detail: {
    borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: radius.md,
    padding: 12, minHeight: 72, textAlignVertical: 'top',
    ...type.body, color: colors.onSurface, marginTop: 4,
  },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14 },
  checkLabel: { ...type.body, color: colors.onSurface },
  checkHint: { ...type.caption, color: colors.onSurfaceVariant, marginTop: 2 },
  error: { ...type.caption, color: colors.error, marginTop: 10 },
  submit: {
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: 13, alignItems: 'center', marginTop: 16,
  },
  submitText: { ...type.body, color: colors.onPrimary, fontWeight: '600' },
  footnote: { ...type.caption, color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 10 },
});
