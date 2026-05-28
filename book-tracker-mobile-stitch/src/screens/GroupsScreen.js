import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { groupsAPI, userAPI } from '../services/api';
import { PreloadContext } from '../../App';
import { colors, radius, shadow, type } from '../theme';
import AppHeader from '../components/AppHeader';

const COVER_COLORS = {
  teal:   { bg: '#004d51', text: '#ffffff' },
  amber:  { bg: '#fff8e1', text: '#735c00' },
  rose:   { bg: '#fce4ec', text: '#880e4f' },
  indigo: { bg: '#e8eaf6', text: '#283593' },
  green:  { bg: '#e8f5e9', text: '#1b5e20' },
};

function GroupCover({ preset = 'teal', size = 80 }) {
  const c = COVER_COLORS[preset] || COVER_COLORS.teal;
  return (
    <View style={[styles.cover, { width: size, height: size, borderRadius: size / 5, backgroundColor: c.bg }]}>
      <Ionicons name="book" size={size * 0.4} color={c.text} />
    </View>
  );
}

function GroupCard({ group, onPress }) {
  const { t } = useTranslation();
  const isCurator = group.user_role === 'curator';
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <GroupCover preset={group.cover_preset} size={80} />
      <View style={styles.cardBody}>
        {isCurator && (
          <Text style={styles.curatorBadge}>{t('groups.curatorBadge')}</Text>
        )}
        <Text style={styles.cardName} numberOfLines={1}>{group.name}</Text>
        {group.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{group.description}</Text>
        ) : null}
        <View style={styles.cardMeta}>
          <Ionicons name="people-outline" size={13} color={colors.onSurfaceVariant} />
          <Text style={styles.cardMetaText}>{t('groups.memberCount', { count: group.member_count ?? 0 })}</Text>
          {group.is_private && (
            <>
              <Text style={styles.metaDot}>•</Text>
              <Ionicons name="lock-closed-outline" size={13} color={colors.onSurfaceVariant} />
              <Text style={styles.cardMetaText}>{t('common.private')}</Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const COVER_PRESETS = [
  { key: 'teal',   bg: '#00464a', icon: 'book' },
  { key: 'olive',  bg: '#4a5e00', icon: 'leaf' },
  { key: 'amber',  bg: '#7a5800', icon: 'sunny' },
  { key: 'rose',   bg: '#7a1030', icon: 'heart' },
  { key: 'indigo', bg: '#283593', icon: 'planet' },
  { key: 'green',  bg: '#1b5e20', icon: 'aperture' },
  { key: 'purple', bg: '#4a1580', icon: 'telescope' },
  { key: 'brown',  bg: '#4e342e', icon: 'compass' },
];

function CreateGroupModal({ visible, onClose, onCreated }) {
  const { t } = useTranslation();
  const [name, setName]           = useState('');
  const [desc, setDesc]           = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [preset, setPreset]       = useState('teal');
  const [readingGoal, setReadingGoal] = useState('');
  const [goalPeriod, setGoalPeriod]   = useState('monthly');
  const [saving, setSaving]       = useState(false);

  const selectedPreset = COVER_PRESETS.find(p => p.key === preset) || COVER_PRESETS[0];

  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert(t('common.error'), 'Name required'); return; }
    setSaving(true);
    try {
      const g = await groupsAPI.createGroup({
        name: name.trim(),
        description: desc.trim(),
        is_private: isPrivate,
        cover_preset: preset,
        reading_goal: readingGoal ? parseInt(readingGoal) : null,
        goal_period: goalPeriod,
      });
      onCreated(g);
      setName(''); setDesc(''); setIsPrivate(false); setPreset('teal');
      setReadingGoal(''); setGoalPeriod('monthly');
      onClose();
    } catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not create group'); }
    setSaving(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={styles.modalRoot} contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <Text style={styles.modalEyebrow}>{t('groups.groupsEyebrow')}</Text>
        <Text style={styles.modalBigTitle}>{t('groups.createGroupTitle')}</Text>
        <Text style={styles.modalSubtitle}>{t('groups.createGroupSubtitle')}</Text>

        {/* Cover picker */}
        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>{t('groups.coverLabel')}</Text>
        <View style={styles.coverGrid}>
          {COVER_PRESETS.map(p => (
            <TouchableOpacity
              key={p.key}
              onPress={() => setPreset(p.key)}
              style={[styles.coverTile, { backgroundColor: p.bg }, preset === p.key && styles.coverTileSelected]}
              activeOpacity={0.8}
            >
              <Ionicons name={p.icon} size={22} color="#fff" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Cover preview */}
        <View style={[styles.coverPreview, { backgroundColor: selectedPreset.bg }]}>
          <Ionicons name={selectedPreset.icon} size={28} color="#fff" style={{ marginRight: 10 }} />
          <Text style={styles.coverPreviewName} numberOfLines={1}>{name || 'Your Group Name'}</Text>
        </View>

        {/* Group name */}
        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>{t('groups.groupNameLabel')}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('groups.groupNamePlaceholder')}
          placeholderTextColor={colors.outline}
          maxLength={60}
        />

        {/* Description */}
        <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t('groups.descriptionLabel')}</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={desc}
          onChangeText={setDesc}
          placeholder={t('groups.descriptionPlaceholder')}
          placeholderTextColor={colors.outline}
          multiline
          numberOfLines={3}
        />

        {/* Privacy */}
        <View style={styles.privacyCards}>
          <TouchableOpacity
            style={[styles.privacyCard, !isPrivate && styles.privacyCardSelected]}
            onPress={() => setIsPrivate(false)}
            activeOpacity={0.8}
          >
            <Ionicons name="earth-outline" size={22} color={!isPrivate ? colors.primary : colors.onSurfaceVariant} style={{ marginBottom: 6 }} />
            <Text style={[styles.privacyCardTitle, !isPrivate && { color: colors.primary }]}>{t('groups.privacyPublic')}</Text>
            <Text style={styles.privacyCardSub}>{t('groups.privacyPublicDesc')}</Text>
            <View style={[styles.privacyCardBtn, !isPrivate && styles.privacyCardBtnSelected]}>
              <Text style={[styles.privacyCardBtnText, !isPrivate && { color: colors.primary }]}>
                {!isPrivate ? `Selected ${t('groups.privacyPublic')}` : `Select ${t('groups.privacyPublic')}`}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.privacyCard, isPrivate && styles.privacyCardSelected]}
            onPress={() => setIsPrivate(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="lock-closed-outline" size={22} color={isPrivate ? colors.primary : colors.onSurfaceVariant} style={{ marginBottom: 6 }} />
            <Text style={[styles.privacyCardTitle, isPrivate && { color: colors.primary }]}>{t('groups.privacyPrivate')}</Text>
            <Text style={styles.privacyCardSub}>{t('groups.privacyPrivateDesc')}</Text>
            <View style={[styles.privacyCardBtn, isPrivate && styles.privacyCardBtnSelected]}>
              <Text style={[styles.privacyCardBtnText, isPrivate && { color: colors.primary }]}>
                {isPrivate ? `Selected ${t('groups.privacyPrivate')}` : `Select ${t('groups.privacyPrivate')}`}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Reading goal */}
        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>{t('groups.readingGoalLabel')}</Text>
        <View style={styles.goalRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={readingGoal}
            onChangeText={setReadingGoal}
            placeholder={t('groups.goalPlaceholder')}
            placeholderTextColor={colors.outline}
            keyboardType="numeric"
          />
          <View style={styles.goalPeriodToggle}>
            {['monthly', 'yearly'].map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.goalPeriodBtn, goalPeriod === p && styles.goalPeriodBtnActive]}
                onPress={() => setGoalPeriod(p)}
              >
                <Text style={[styles.goalPeriodText, goalPeriod === p && styles.goalPeriodTextActive]}>
                  {p === 'monthly' ? t('common.monthly') : t('common.yearly')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Ready to go */}
        <View style={styles.readyCard}>
          <Text style={styles.readyTitle}>{t('groups.readyToGo')}</Text>
          <Text style={styles.readySub}>{t('groups.youllBeAdmin')}</Text>
          <TouchableOpacity
            style={[styles.createBtn, saving && { opacity: 0.6 }]}
            onPress={handleCreate}
            disabled={saving || !name.trim()}
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.onPrimary} />
              : <Text style={styles.createBtnText}>{t('groups.createGroup')}</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ marginTop: 12, alignItems: 'center' }}>
            <Text style={styles.cancelLink}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </Modal>
  );
}

function JoinModal({ visible, onClose, onJoined }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    if (!code.trim()) return;
    setJoining(true);
    try { const g = await groupsAPI.joinByInviteCode(code.trim()); onJoined(g); setCode(''); onClose(); }
    catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Invalid invite code'); }
    setJoining(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.joinOverlay}>
        <View style={styles.joinSheet}>
          <Text style={styles.modalTitle}>{t('groups.joinByInviteCode')}</Text>
          <TextInput style={[styles.input, { marginTop: 16, marginBottom: 12 }]} value={code} onChangeText={setCode} placeholder={t('groups.enterInviteCode')} placeholderTextColor={colors.outline} autoCapitalize="none" />
          <TouchableOpacity style={styles.createBtn} onPress={handleJoin} disabled={joining}>
            <Text style={styles.createBtnText}>{joining ? t('groups.joining') : t('groups.joinCircle')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ marginTop: 10, alignItems: 'center' }}>
            <Text style={{ color: colors.onSurfaceVariant, fontSize: 14 }}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function GroupsScreen({ navigation }) {
  const { t } = useTranslation();
  const preloaded = useContext(PreloadContext);
  const [currentUser, setCurrentUser] = useState(preloaded?.profile || null);

  useEffect(() => {
    if (!currentUser) {
      userAPI.getProfile().then(setCurrentUser).catch(() => {});
    }
  }, []);
  const hasPreloaded = Array.isArray(preloaded?.groups) && preloaded.groups.length >= 0;
  const [myGroups, setMyGroups] = useState(preloaded?.groups || []);
  const [pendingGroups, setPendingGroups] = useState(preloaded?.pendingGroups || []);
  const [discover, setDiscover] = useState([]);
  const [discoverQ, setDiscoverQ] = useState('');
  const [loading, setLoading] = useState(!hasPreloaded);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const loadMine = useCallback(async () => {
    try { const data = await groupsAPI.getMyGroups(); setMyGroups(Array.isArray(data) ? data : []); }
    catch { setMyGroups([]); }
  }, []);

  const loadPending = useCallback(async () => {
    try { const data = await groupsAPI.getMyPendingGroups(); setPendingGroups(Array.isArray(data) ? data : []); }
    catch { setPendingGroups([]); }
  }, []);

  const loadDiscover = useCallback(async (q = '') => {
    try { const data = await groupsAPI.discoverGroups(q); setDiscover(Array.isArray(data) ? data : []); }
    catch { setDiscover([]); }
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    await Promise.all([loadMine(), loadPending(), loadDiscover(discoverQ)]);
    setLoading(false); setRefreshing(false);
  }, [discoverQ]);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(() => loadDiscover(discoverQ), 350);
    return () => clearTimeout(t);
  }, [discoverQ]);

  useFocusEffect(
    useCallback(() => {
      loadPending();
    }, [loadPending])
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <AppHeader
        user={currentUser}
        onBellPress={() => navigation.navigate('Notifications')}
        onAvatarPress={() => navigation.navigate('Profile')}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Hero header ── */}
        <View style={styles.hero}>
          <View style={styles.heroText}>
            <Text style={styles.heroEyebrow}>{t('groups.eyebrow')}</Text>
            <Text style={styles.heroTitle}>{t('groups.title')}</Text>
            <Text style={styles.heroSub}>{t('groups.subtitle')}</Text>
          </View>
          <TouchableOpacity style={styles.createHeroBtn} onPress={() => setShowCreate(true)}>
            <Ionicons name="add" size={16} color={colors.onPrimary} />
            <Text style={styles.createHeroBtnText}>{t('groups.createNewGroup')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Your Groups ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('groups.yourGroups')}</Text>
          {myGroups.length === 0 ? (
            <View style={styles.emptySection}>
              <Text style={styles.emptySectionText}>{t('groups.noCirclesYet')}</Text>
              <TouchableOpacity onPress={() => setShowJoin(true)}>
                <Text style={styles.joinLink}>{t('groups.haveInviteCode')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {myGroups.map(g => (
                <GroupCard key={g.id} group={g} onPress={() => navigation.navigate('GroupDetail', { groupId: g.id })} />
              ))}
              <TouchableOpacity style={styles.joinCodeBtn} onPress={() => setShowJoin(true)}>
                <Ionicons name="enter-outline" size={15} color={colors.primary} />
                <Text style={styles.joinCodeText}>{t('groups.joinWithInviteCode')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Pending Requests ── */}
        {pendingGroups.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('groups.pendingRequests')}</Text>
            <Text style={styles.sectionSub}>{t('groups.waitingForApproval')}</Text>
            {pendingGroups.map(g => (
              <TouchableOpacity
                key={g.id}
                style={[styles.card, { borderWidth: 1, borderColor: colors.outlineVariant, borderStyle: 'dashed' }]}
                onPress={() => navigation.navigate('GroupDetail', { groupId: g.id })}
                activeOpacity={0.75}
              >
                <GroupCover preset={g.cover_preset} size={80} />
                <View style={styles.cardBody}>
                  <Text style={[styles.curatorBadge, { color: colors.tertiary }]}>{t('groups.requestPending')}</Text>
                  <Text style={styles.cardName} numberOfLines={1}>{g.name}</Text>
                  {g.description ? (
                    <Text style={styles.cardDesc} numberOfLines={2}>{g.description}</Text>
                  ) : null}
                  <View style={styles.cardMeta}>
                    <Ionicons name="people-outline" size={13} color={colors.onSurfaceVariant} />
                    <Text style={styles.cardMetaText}>{t('groups.memberCount', { count: g.member_count ?? 0 })}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Discover Groups ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('groups.discoverGroups')}</Text>
          <Text style={styles.sectionSub}>{t('groups.discoverSubtitle')}</Text>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={15} color={colors.outline} />
            <TextInput
              style={styles.searchInput}
              value={discoverQ}
              onChangeText={setDiscoverQ}
              placeholder={t('groups.searchGroups')}
              placeholderTextColor={colors.outline}
            />
          </View>
          {discover.length === 0 ? (
            <View style={styles.emptySection}>
              <Ionicons name="search-outline" size={40} color={colors.outlineVariant} />
              <Text style={styles.emptySectionText}>{discoverQ ? t('groups.noCirclesFound') : t('groups.searchToExplore')}</Text>
            </View>
          ) : (
            discover.map(g => (
              <GroupCard key={g.id} group={g} onPress={() => navigation.navigate('GroupDetail', { groupId: g.id })} />
            ))
          )}
        </View>
      </ScrollView>

      <CreateGroupModal visible={showCreate} onClose={() => setShowCreate(false)} onCreated={g => setMyGroups(prev => [g, ...prev])} />
      <JoinModal visible={showJoin} onClose={() => setShowJoin(false)} onJoined={g => setMyGroups(prev => [g, ...prev])} />
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.surface },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  scroll:     { paddingBottom: 40 },

  // Hero
  hero:           { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  heroText:       { marginBottom: 20 },
  heroEyebrow:    { ...type.eyebrow, color: colors.secondary, marginBottom: 6 },
  heroTitle:      { fontFamily: 'NotoSerif_700Bold', fontSize: 36, fontWeight: '700', color: colors.onSurfaceVariant, lineHeight: 44, marginBottom: 12 },
  heroSub:        { ...type.body, color: colors.onSurfaceVariant },
  createHeroBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.lg, alignSelf: 'flex-start', ...shadow.float },
  createHeroBtnText: { ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onPrimary },

  // Sections
  section:        { paddingHorizontal: 20, marginBottom: 8 },
  sectionTitle:   { ...type.titleLg, color: colors.onSurface, marginBottom: 4 },
  sectionSub:     { ...type.bodySm, color: colors.onSurfaceVariant, marginBottom: 14 },
  emptySection:   { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptySectionText: { ...type.body, color: colors.onSurfaceVariant },
  joinLink:       { ...type.bodySm, color: colors.primary, fontFamily: 'Manrope_600SemiBold', fontWeight: '600' },
  joinCodeBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start' },
  joinCodeText:   { ...type.bodySm, color: colors.primary, fontFamily: 'Manrope_600SemiBold', fontWeight: '600' },

  // Search
  searchWrap:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14, borderWidth: 1, borderColor: colors.outlineVariant + '60' },
  searchInput:  { ...type.body, flex: 1, color: colors.onSurface },

  // Group cards
  card:         { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 14, gap: 14, marginBottom: 12, ...shadow.card },
  cover:        { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardBody:     { flex: 1, gap: 3 },
  curatorBadge: { ...type.eyebrow, color: colors.secondary, marginBottom: 2 },
  cardName:     { ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onSurface },
  cardDesc:     { ...type.label, color: colors.onSurfaceVariant, lineHeight: 17 },
  cardMeta:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cardMetaText: { ...type.label, color: colors.onSurfaceVariant },
  metaDot:      { ...type.label, color: colors.outline, marginHorizontal: 2 },

  // Create group modal
  modalRoot:      { flex: 1, backgroundColor: colors.surface },
  modalScroll:    { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 48 },
  modalEyebrow:   { ...type.eyebrow, color: colors.secondary, marginBottom: 6 },
  modalBigTitle:  { fontFamily: 'NotoSerif_700Bold', fontSize: 28, fontWeight: '700', color: colors.primary, marginBottom: 6, lineHeight: 36 },
  modalSubtitle:  { ...type.bodySm, color: colors.onSurfaceVariant, marginBottom: 4 },

  fieldLabel:     { ...type.eyebrow, color: colors.onSurfaceVariant, marginBottom: 10 },
  optionalLabel:  { fontFamily: 'Manrope_400Regular', fontWeight: '400', letterSpacing: 0, textTransform: 'none', color: colors.outline },
  input:          { ...type.body, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, color: colors.onSurface, borderWidth: 1, borderColor: colors.outlineVariant + '60' },
  inputMulti:     { minHeight: 80, textAlignVertical: 'top' },

  // Cover grid
  coverGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  coverTile:      { width: 64, height: 64, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', opacity: 0.75 },
  coverTileSelected: { opacity: 1, borderWidth: 3, borderColor: '#fff', ...shadow.float },
  coverPreview:   { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, paddingHorizontal: 18, paddingVertical: 14, marginBottom: 4, ...shadow.card },
  coverPreviewName: { ...type.title, color: '#fff', flex: 1 },

  // Privacy cards
  privacyCards:   { flexDirection: 'row', gap: 12, marginTop: 16 },
  privacyCard:    { flex: 1, backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 14, borderWidth: 1.5, borderColor: colors.outlineVariant + '60', ...shadow.card },
  privacyCardSelected: { borderColor: colors.primary },
  privacyCardTitle: { ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onSurface, marginBottom: 4 },
  privacyCardSub:   { ...type.caption, color: colors.onSurfaceVariant, lineHeight: 16, marginBottom: 10 },
  privacyCardBtn:   { borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: colors.surfaceContainerHigh, alignItems: 'center' },
  privacyCardBtnSelected: { backgroundColor: colors.primary + '18' },
  privacyCardBtnText: { ...type.caption, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onSurfaceVariant },

  // Reading goal
  goalRow:        { flexDirection: 'row', gap: 10, alignItems: 'center' },
  goalPeriodToggle: { flexDirection: 'row', backgroundColor: colors.surfaceContainerHigh, borderRadius: radius.md, overflow: 'hidden' },
  goalPeriodBtn:  { paddingHorizontal: 12, paddingVertical: 11 },
  goalPeriodBtnActive: { backgroundColor: colors.primary },
  goalPeriodText: { ...type.label, color: colors.onSurfaceVariant },
  goalPeriodTextActive: { color: colors.onPrimary },

  // Ready card
  readyCard:      { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.xl, padding: 20, marginTop: 24, ...shadow.card },
  readyTitle:     { ...type.titleLg, color: colors.onSurface, marginBottom: 4 },
  readySub:       { ...type.bodySm, color: colors.onSurfaceVariant, marginBottom: 16 },
  createBtn:      { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center' },
  createBtnText:  { ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onPrimary },
  cancelLink:     { ...type.body, color: colors.onSurfaceVariant },

  // Join modal
  joinOverlay:    { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  joinSheet:      { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle:     { ...type.titleLg, color: colors.primary },
});
