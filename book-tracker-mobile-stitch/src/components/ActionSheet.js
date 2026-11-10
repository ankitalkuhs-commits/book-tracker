// Sprint 4M — the container every `···` overflow menu renders through.
//
// App Review rejected 2.2.5 (9) under Guideline 4 because the profile menu "was inaccessible":
// it was a `position: 'absolute'` View inside a 34 px wrapper, and on iOS a later sibling card
// painted over it while touches outside the wrapper's bounds were never delivered. A Modal has
// neither problem — it paints above the whole screen and receives every touch — and a bottom
// sheet never overlaps the content it was opened from, which the floating dropdown did on the
// feed. Same shape as ReportDialog and the shelf picker, so it reads as one product.
//
// This is a CONTAINER, not a menu: the caller renders its own items as children, so each
// screen's gates (owner/admin, following) stay where __tests__/reportAffordance.test.mjs can
// see them.
import React from 'react';
import { Modal, Pressable, View, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '../theme';

export default function ActionSheet({ visible, onClose, children }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.close')}
      />
      <View style={[styles.sheet, { maxWidth: Math.min(width - 24, 520), paddingBottom: 12 + insets.bottom }]}>
        <View style={styles.handle} />
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#00000066' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    width: '100%', alignSelf: 'center',
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingTop: 8, paddingHorizontal: 8,
  },
  handle: { width: 40, height: 4, backgroundColor: colors.outlineVariant, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
});
