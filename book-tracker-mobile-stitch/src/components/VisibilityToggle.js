import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { NOTE_VISIBILITY_KEY } from '../services/api';
import { parseStoredVisibility, serializeVisibility } from '../utils/noteVisibility';
import { colors, radius, type } from '../theme';

// Shared "remember the last choice" hook for every note composer (T-11).
// Starts Private; re-reads the stored choice whenever the screen regains focus,
// so a choice made on another screen shows up here too.
export function useNoteVisibility() {
  const isFocused = useIsFocused();
  const [isPublic, setIsPublicState] = useState(false);

  useEffect(() => {
    if (!isFocused) return;
    AsyncStorage.getItem(NOTE_VISIBILITY_KEY)
      .then(v => setIsPublicState(parseStoredVisibility(v)))
      .catch(() => setIsPublicState(false));
  }, [isFocused]);

  const setIsPublic = (next) => {
    setIsPublicState(next);
    AsyncStorage.setItem(NOTE_VISIBILITY_KEY, serializeVisibility(next)).catch(() => {});
  };

  return [isPublic, setIsPublic];
}

// Presentational Public/Private pill. Does no storage itself — the caller
// supplies isPublic/onChange, from useNoteVisibility() or a local state.
export default function VisibilityToggle({ isPublic, onChange, disabled }) {
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      style={[styles.pill, isPublic ? styles.pillPublic : styles.pillPrivate, disabled && styles.pillDisabled]}
      onPress={() => onChange(!isPublic)}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="switch"
      accessibilityState={{ checked: isPublic }}
      accessibilityLabel={t('a11y.postVisibility')}
      accessibilityHint={t(isPublic ? 'notes.visibilityHintPublic' : 'notes.visibilityHintPrivate')}
    >
      <Ionicons
        name={isPublic ? 'earth-outline' : 'lock-closed-outline'}
        size={14}
        color={isPublic ? colors.primary : colors.onSurfaceVariant}
      />
      <Text style={[styles.pillText, isPublic && styles.pillTextPublic]}>
        {t(isPublic ? 'common.public' : 'common.private')}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  pillPrivate: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.outlineVariant,
  },
  pillPublic: {
    backgroundColor: colors.primaryContainer + '22',
    borderColor: colors.primary,
  },
  pillDisabled: { opacity: 0.5 },
  pillText: { ...type.label, color: colors.onSurfaceVariant },
  pillTextPublic: { color: colors.primary },
});
