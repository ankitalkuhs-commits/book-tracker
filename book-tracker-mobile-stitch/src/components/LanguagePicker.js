// The language control for readers who have NOT signed in yet.
//
// src/i18n/index.js picks a language with `savedLang || detectLanguage()`, and detectLanguage
// reads the device locale. Until this existed, the only switcher in the app lived in
// SettingsScreen, which is behind the auth gate - so a reader whose phone is in a language they
// do not read had to sign in, in that language, to find the control. The same defect was fixed
// on the web in 4725863; this is the mobile half.
//
// It writes through `changeLanguage`, which persists to AsyncStorage under the same
// `tmr_language` key the web uses, so the choice survives a restart.
import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { changeLanguage, SUPPORTED_LANGUAGES } from '../i18n';
import { colors, radius, type } from '../theme';

export default function LanguagePicker() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  // Sized per render, never frozen at module scope: this screen is reviewed on iPad
  // (supportsTablet) and must not be a phone-shaped box there. Same rule as ReportDialog.
  const { width } = useWindowDimensions();

  // i18n.language can carry a region tag ("en-GB"); the list keys are bare codes.
  const code = (i18n.language || 'en').split('-')[0];
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === code);

  const pick = async (next) => {
    await changeLanguage(next);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={styles.trigger}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.changeLanguage')}
      >
        <Ionicons name="language-outline" size={16} color={colors.onSurfaceVariant} />
        <Text style={styles.triggerText}>{(current || SUPPORTED_LANGUAGES[0]).label}</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { maxWidth: Math.min(width - 48, 360) }]}>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                onPress={() => pick(lang.code)}
                style={styles.row}
                accessibilityRole="radio"
                accessibilityState={{ selected: current?.code === lang.code }}
              >
                <Text style={[styles.rowText, current?.code === lang.code && styles.rowActive]}>
                  {lang.label}
                </Text>
                {current?.code === lang.code && (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: radius.full, backgroundColor: colors.surfaceContainerLow,
  },
  triggerText: { ...type.caption, color: colors.onSurfaceVariant, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: '#00000055', alignItems: 'center', justifyContent: 'center' },
  sheet: {
    width: '100%', backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl, paddingVertical: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, paddingHorizontal: 18,
  },
  rowText: { ...type.body, color: colors.onSurface },
  rowActive: { color: colors.primary, fontWeight: '700' },
});
