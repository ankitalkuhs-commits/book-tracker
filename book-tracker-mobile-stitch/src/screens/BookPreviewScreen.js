import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { booksAPI, userbooksAPI } from '../services/api';
import { colors, radius, shadow, type } from '../theme';

// ── Amazon helper ─────────────────────────────────────────────────────────────

const AMAZON_TAG_IN  = 'trackmyread-21';
const AMAZON_TAG_COM = 'trackmyread-20';

function getAmazonUrl(title, author) {
  const q     = encodeURIComponent(`${title} ${author || ''}`.trim());
  const tz    = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const india = tz === 'Asia/Calcutta' || tz === 'Asia/Kolkata';
  return `https://www.${india ? 'amazon.in' : 'amazon.com'}/s?k=${q}&tag=${india ? AMAZON_TAG_IN : AMAZON_TAG_COM}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BookPreviewScreen({ route, navigation }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const STATUS_OPTIONS = [
    { key: 'to-read',  label: t('status.wantToRead'), icon: 'bookmark-outline' },
    { key: 'reading',  label: t('status.reading'),    icon: 'book-outline' },
    { key: 'finished', label: t('status.finished'),   icon: 'checkmark-circle-outline' },
  ];
  // Normalize: accept either a flat book or a userbook with nested book
  const rawBook      = route.params?.book || {};
  const book         = rawBook.book || rawBook; // unwrap if it's a userbook

  const [myUserbook,     setMyUserbook]     = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [adding,         setAdding]         = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [descExpanded,   setDescExpanded]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const books = await userbooksAPI.getMyBooks();
        const found = (books || []).find(ub =>
          (book.id           && ub.book?.id           === book.id) ||
          (book.google_books_id && ub.book?.google_books_id === book.google_books_id)
        );
        setMyUserbook(found || null);
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  const handleAdd = async () => {
    if (!selectedStatus) {
      Alert.alert(t('book.pickStatus'), t('book.chooseHowToTrack'));
      return;
    }
    setAdding(true);
    try {
      const result = await booksAPI.addToLibrary({
        google_books_id: book.google_books_id || book.google_id || null,
        title:      book.title,
        author:     book.author || '',
        cover_url:  book.cover_url || null,
        total_pages: book.total_pages || null,
        status: selectedStatus,
      });
      setMyUserbook(result);
      Alert.alert(selectedStatus === 'reading' ? t('book.happyReadingEmoji') : t('book.addedToYourLibrary'), '');
    } catch (e) {
      Alert.alert(t('common.error'), e?.response?.data?.detail || 'Could not add book');
    }
    setAdding(false);
  };

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>{book.title || 'Book'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

        {/* ── Cover + meta ── */}
        <View style={styles.coverSection}>
          <View style={styles.coverCard}>
            {book.cover_url ? (
              <Image source={{ uri: book.cover_url }} style={styles.coverImage} resizeMode="cover" />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="book" size={48} color={colors.primary} />
              </View>
            )}
          </View>
          <Text style={styles.bookTitle}>{book.title || 'Unknown Title'}</Text>
          {book.author     ? <Text style={styles.bookAuthor}>{book.author}</Text>   : null}
          {book.total_pages ? <Text style={styles.bookPages}>{t('book.totalPages', { total: book.total_pages })}</Text> : null}

          {book.description ? (
            <TouchableOpacity onPress={() => setDescExpanded(v => !v)} activeOpacity={0.8} style={styles.descToggle}>
              <Text style={styles.descText} numberOfLines={descExpanded ? undefined : 3}>{book.description}</Text>
              <Text style={styles.descToggleText}>{descExpanded ? t('book.showLess') : t('book.showMore')}</Text>
            </TouchableOpacity>
          ) : null}

          {/* Amazon */}
          <TouchableOpacity
            style={styles.amazonBtn}
            onPress={() => Linking.openURL(getAmazonUrl(book.title, book.author))}
            activeOpacity={0.8}
          >
            <Ionicons name="cart-outline" size={16} color="#92400e" />
            <Text style={styles.amazonBtnText}>{t('book.buyOnAmazon')}</Text>
          </TouchableOpacity>
          <Text style={styles.amazonDisclaimer}>{t('book.affiliateDisclaimer')}</Text>
        </View>

        {/* ── Library actions ── */}
        <View style={styles.section}>
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : myUserbook ? (
            <>
              <View style={styles.inLibraryRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={styles.inLibraryText}>{t('book.alreadyInLibrary')}</Text>
              </View>
              <TouchableOpacity
                style={styles.viewBtn}
                onPress={() => navigation.navigate('BookDetail', { userbook: myUserbook })}
              >
                <Text style={styles.viewBtnText}>{t('book.viewInMyLibrary')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.sectionLabel}>{t('book.addToLibrarySection')}</Text>
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.statusPill, selectedStatus === opt.key && styles.statusPillActive]}
                    onPress={() => setSelectedStatus(opt.key)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={14}
                      color={selectedStatus === opt.key ? colors.onPrimary : colors.onSurfaceVariant}
                    />
                    <Text style={[styles.statusPillText, selectedStatus === opt.key && styles.statusPillTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.addBtn, (!selectedStatus || adding) && { opacity: 0.5 }]}
                onPress={handleAdd}
                disabled={!selectedStatus || adding}
              >
                {adding
                  ? <ActivityIndicator size="small" color={colors.onPrimary} />
                  : <Text style={styles.addBtnText}>{t('library.addToLibrary')}</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>

      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },

  topBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '40' },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { flex: 1, ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onSurface, textAlign: 'center' },

  coverSection:    { alignItems: 'center', paddingHorizontal: 32, paddingTop: 24, paddingBottom: 20 },
  coverCard:       { width: 160, height: 240, borderRadius: radius.lg, overflow: 'hidden', marginBottom: 16, ...shadow.float },
  coverImage:      { width: '100%', height: '100%' },
  coverPlaceholder:{ width: '100%', height: '100%', backgroundColor: colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  bookTitle:       { fontFamily: 'NotoSerif_700Bold', fontSize: 22, fontWeight: '700', color: colors.onSurface, textAlign: 'center', lineHeight: 28, marginBottom: 6 },
  bookAuthor:      { ...type.body, color: colors.primary, fontFamily: 'Manrope_600SemiBold', fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  bookPages:       { ...type.caption, color: colors.outline, textAlign: 'center', marginBottom: 4 },
  descToggle:      { marginTop: 12, paddingHorizontal: 4 },
  descText:        { ...type.bodySm, color: colors.onSurfaceVariant, textAlign: 'center', lineHeight: 20 },
  descToggleText:  { ...type.label, color: colors.primary, textAlign: 'center', marginTop: 4 },

  amazonBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, borderRadius: radius.lg, borderWidth: 1.5, borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  amazonBtnText:    { fontSize: 14, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: '#92400e' },
  amazonDisclaimer: { ...type.caption, color: colors.outline, textAlign: 'center', marginTop: 6 },

  section:     { paddingHorizontal: 20, paddingTop: 4 },
  sectionLabel:{ ...type.eyebrow, color: colors.onSurfaceVariant, marginBottom: 14, textAlign: 'center' },

  inLibraryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 14 },
  inLibraryText:{ ...type.body, color: colors.primary, fontFamily: 'Manrope_600SemiBold', fontWeight: '600' },
  viewBtn:      { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center' },
  viewBtnText:  { ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onPrimary },

  statusRow:         { flexDirection: 'row', backgroundColor: colors.surfaceContainerHigh, borderRadius: radius.full, padding: 3, gap: 3, marginBottom: 16 },
  statusPill:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.full, paddingVertical: 8 },
  statusPillActive:  { backgroundColor: colors.primary },
  statusPillText:    { fontSize: 11, fontWeight: '600', color: colors.onSurfaceVariant },
  statusPillTextActive: { color: colors.onPrimary },

  addBtn:     { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center' },
  addBtnText: { ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onPrimary },
});
