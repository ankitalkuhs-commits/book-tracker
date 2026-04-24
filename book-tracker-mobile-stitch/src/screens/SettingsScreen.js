import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Switch, ActivityIndicator, Alert, Image, Modal, FlatList,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { profileAPI, notificationsAPI, authAPI } from '../services/api';
import { colors, radius, shadow, type } from '../theme';

// Notification pref keys must match the backend
const NOTIF_PREFS = [
  { key: 'new_follower',            icon: 'person-add-outline',    label: 'New followers',     desc: 'When someone starts following you' },
  { key: 'post_liked',              icon: 'heart-outline',         label: 'Likes',              desc: 'When someone likes your post' },
  { key: 'post_commented',          icon: 'chatbubble-outline',    label: 'Comments',           desc: 'When someone comments on your post' },
  { key: 'book_completed',          icon: 'book-outline',          label: 'Friend activity',    desc: 'When friends add or finish books' },
  { key: 'reading_streak_reminder', icon: 'flame-outline',         label: 'Streak reminders',   desc: 'Daily reminder to keep your reading streak' },
  { key: 'group_invite',            icon: 'people-outline',        label: 'Circle invites',     desc: 'When someone invites you to join a Circle' },
  { key: 'group_join_request',      icon: 'person-add-outline',    label: 'Join requests',      desc: 'When someone requests to join your Circle (curators only)' },
];

// 12 preset cartoon avatars via DiceBear adventurer
const AVATAR_SEEDS = ['Aneka','Buster','Callie','Destiny','Emery','Felix','Gracie','Harley','Iris','Jasper','Kali','Lexi'];
const AVATAR_BG    = ['#c8e6f5','#dcc8f0','#c8e6c9','#f5dcc8','#f5c8c8','#c8ddf5','#e8c8f5','#f5f0c8','#c8f0e8','#f0c8d8','#d8f0c8','#c8d8f0'];
const AVATARS = AVATAR_SEEDS.map((seed, i) => ({
  id: seed,
  url: `https://api.dicebear.com/9.x/adventurer/png?seed=${seed}&size=200`,
  bg: AVATAR_BG[i],
}));

function SectionHeader({ label }) {
  return <Text style={styles.sectionHeader}>{label}</Text>;
}

function Row({ icon, label, desc, onPress, danger, rightEl }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress} activeOpacity={onPress ? 0.6 : 1}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons name={icon} size={18} color={danger ? colors.error : colors.primary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        {desc && <Text style={styles.rowDesc}>{desc}</Text>}
      </View>
      <View style={styles.rowRight}>
        {rightEl ?? (onPress && <Ionicons name="chevron-forward" size={16} color={colors.outline} />)}
      </View>
    </TouchableOpacity>
  );
}

// ── Avatar Picker Modal ───────────────────────────────────────────────────────
function AvatarPickerModal({ visible, onClose, onSelect }) {
  const [selected, setSelected] = useState(null);

  const handleUse = () => {
    if (selected) { onSelect(selected); onClose(); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerSheet}>
          {/* Header */}
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Choose Avatar</Text>
            <TouchableOpacity onPress={onClose} style={styles.pickerClose}>
              <Ionicons name="close" size={22} color={colors.onSurface} />
            </TouchableOpacity>
          </View>

          {/* Grid */}
          <FlatList
            data={AVATARS}
            numColumns={4}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.pickerGrid}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.avatarTile, { backgroundColor: item.bg }, selected?.id === item.id && styles.avatarTileSelected]}
                onPress={() => setSelected(item)}
                activeOpacity={0.8}
              >
                <Image source={{ uri: item.url }} style={styles.avatarTileImg} />
                {selected?.id === item.id && (
                  <View style={styles.avatarTileCheck}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                  </View>
                )}
              </TouchableOpacity>
            )}
          />

          {/* CTA */}
          <TouchableOpacity
            style={[styles.useAvatarBtn, !selected && { opacity: 0.4 }]}
            onPress={handleUse}
            disabled={!selected}
          >
            <Text style={styles.useAvatarBtnText}>Use This Avatar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Settings Screen ───────────────────────────────────────────────────────────
export default function SettingsScreen({ navigation, onLogout }) {
  const insets = useSafeAreaInsets();
  const [profile,         setProfile]         = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [savedFeedback,   setSavedFeedback]   = useState(false);
  const [editName,        setEditName]        = useState('');
  const [editBio,         setEditBio]         = useState('');
  const [editGoal,        setEditGoal]        = useState('');
  const [editingProfile,  setEditingProfile]  = useState(false);
  const [prefs,           setPrefs]           = useState({});
  const [isPrivate,       setIsPrivate]       = useState(false);
  const [savingPrivacy,   setSavingPrivacy]   = useState(false);
  const [uploadingPhoto,  setUploadingPhoto]  = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [p, np] = await Promise.all([
          profileAPI.getMe(),
          notificationsAPI.getPrefs().catch(() => null),
        ]);
        setProfile(p);
        setEditName(p.name || '');
        setEditBio(p.bio || '');
        setEditGoal(p.yearly_goal ? String(p.yearly_goal) : '');
        setIsPrivate(p.is_private_profile || false);
        if (np) setPrefs(np);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const saveProfile = async () => {
    if (!editName.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      const updated = await profileAPI.updateMe({
        name: editName.trim(),
        bio: editBio.trim(),
        yearly_goal: editGoal ? parseInt(editGoal, 10) : null,
      });
      setProfile(updated);
      setEditingProfile(false);
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2500);
    } catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not save profile'); }
    setSaving(false);
  };

  const handleSelectAvatar = async (avatar) => {
    setUploadingPhoto(true);
    try {
      const updated = await profileAPI.updateMe({ profile_picture: avatar.url });
      setProfile(prev => ({ ...prev, profile_picture: avatar.url }));
    } catch { Alert.alert('Error', 'Could not set avatar'); }
    setUploadingPhoto(false);
  };

  const handlePhotoUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (result.canceled) return;
    setUploadingPhoto(true);
    try {
      const updated = await profileAPI.uploadPicture(result.assets[0].uri);
      setProfile(prev => ({ ...prev, profile_picture: updated.profile_picture }));
    } catch { Alert.alert('Error', 'Could not upload photo'); }
    setUploadingPhoto(false);
  };

  const togglePrivacy = async (val) => {
    setIsPrivate(val);
    setSavingPrivacy(true);
    try { await profileAPI.updateMe({ is_private_profile: val }); }
    catch { setIsPrivate(!val); }
    setSavingPrivacy(false);
  };

  const togglePref = async (key) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    try { await notificationsAPI.updatePrefs({ [key]: updated[key] }); }
    catch { setPrefs(prefs); }
  };

  const handleLogout = () => Alert.alert('Sign out', 'Are you sure?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: async () => { await authAPI.logout(); onLogout?.(); } },
  ]);

  const handleDeleteAccount = () => Alert.alert(
    'Delete Account?',
    'This will permanently delete your account, library, notes, and all data. This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await profileAPI.deleteAccount(); await authAPI.logout(); onLogout?.(); }
        catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not delete account'); }
      }},
    ]
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const initials = (profile?.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <View style={styles.container}>
      {/* ── Header with back button ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Profile section ── */}
        <SectionHeader label="Profile" />
        <View style={styles.card}>
          {/* Photo + name + email */}
          <View style={styles.profileHero}>
            <View style={styles.avatarWrap}>
              {uploadingPhoto ? (
                <View style={styles.avatarImg}><ActivityIndicator color={colors.primary} /></View>
              ) : profile?.profile_picture ? (
                <Image source={{ uri: profile.profile_picture }} style={styles.avatarImg} />
              ) : (
                <View style={[styles.avatarImg, styles.avatarFallback]}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{profile?.name || 'Your Name'}</Text>
              <Text style={styles.profileEmail}>{profile?.email || ''}</Text>
              {/* Two action buttons */}
              <View style={styles.photoBtns}>
                <TouchableOpacity style={styles.photoBtn} onPress={() => setShowAvatarPicker(true)}>
                  <Ionicons name="happy-outline" size={15} color={colors.primary} />
                  <Text style={styles.photoBtnText}>Choose avatar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={handlePhotoUpload} disabled={uploadingPhoto}>
                  <Ionicons name="cloud-upload-outline" size={15} color={colors.primary} />
                  <Text style={styles.photoBtnText}>Upload photo</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.rowSep} />

          {editingProfile ? (
            <View style={styles.editBlock}>
              <Text style={styles.fieldLabel}>Display Name</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="Your name"
                placeholderTextColor={colors.outline}
                autoFocus
              />

              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Bio</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                value={editBio}
                onChangeText={setEditBio}
                placeholder="A little about you and your reading life…"
                placeholderTextColor={colors.outline}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Yearly Reading Goal</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  style={[styles.input, { width: 80 }]}
                  value={editGoal}
                  onChangeText={setEditGoal}
                  placeholder="24"
                  placeholderTextColor={colors.outline}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <Text style={styles.rowDesc}>books per year</Text>
              </View>

              <View style={styles.editActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => {
                  setEditName(profile?.name || '');
                  setEditBio(profile?.bio || '');
                  setEditGoal(profile?.yearly_goal ? String(profile.yearly_goal) : '');
                  setEditingProfile(false);
                }}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, (!editName.trim() || saving) && { opacity: 0.5 }]}
                  onPress={saveProfile}
                  disabled={saving || !editName.trim()}
                >
                  <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
                </TouchableOpacity>
              </View>

              {savedFeedback && (
                <View style={styles.savedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                  <Text style={styles.savedBadgeText}>Saved!</Text>
                </View>
              )}
            </View>
          ) : (
            <>
              <Row icon="person-outline"        label={profile?.name || 'Set your name'}         onPress={() => setEditingProfile(true)} />
              {profile?.username && <>
                <View style={styles.rowSep} />
                <Row icon="at-outline"           label={`@${profile.username}`} />
              </>}
              <View style={styles.rowSep} />
              <Row icon="document-text-outline" label={profile?.bio || 'Add a bio…'}              onPress={() => setEditingProfile(true)} />
              <View style={styles.rowSep} />
              <Row icon="flag-outline"
                label={profile?.yearly_goal > 0 ? `${profile.yearly_goal} books / year` : 'Set yearly goal'}
                onPress={() => setEditingProfile(true)}
              />
            </>
          )}
        </View>

        {/* ── Privacy section ── */}
        <SectionHeader label="Privacy" />
        <View style={styles.card}>
          <Row
            icon="lock-closed-outline"
            label="Private Profile"
            desc="Only your followers can see your library and notes."
            rightEl={
              <Switch
                value={isPrivate}
                onValueChange={togglePrivacy}
                disabled={savingPrivacy}
                trackColor={{ false: colors.outlineVariant, true: colors.primary }}
                thumbColor={colors.onPrimary}
              />
            }
          />
          {isPrivate && (
            <View style={styles.privateNotice}>
              <Ionicons name="lock-closed" size={13} color={colors.onSurfaceVariant} />
              <Text style={styles.privateNoticeText}>Your profile is private. Non-followers see a locked view.</Text>
            </View>
          )}
        </View>

        {/* ── Notifications section ── */}
        <SectionHeader label="Notifications" />
        <View style={styles.card}>
          {NOTIF_PREFS.map((item, i) => (
            <View key={item.key}>
              <Row
                icon={item.icon}
                label={item.label}
                desc={item.desc}
                rightEl={
                  <Switch
                    value={prefs[item.key] ?? true}
                    onValueChange={() => togglePref(item.key)}
                    trackColor={{ false: colors.outlineVariant, true: colors.primary }}
                    thumbColor={colors.onPrimary}
                  />
                }
              />
              {i < NOTIF_PREFS.length - 1 && <View style={styles.rowSep} />}
            </View>
          ))}
        </View>

        {/* ── Account section ── */}
        <SectionHeader label="Account" />
        <View style={styles.card}>
          <Row icon="mail-outline"    label={profile?.email || 'Email'} />
          <View style={styles.rowSep} />
          <Row icon="log-out-outline" label="Sign out"       onPress={handleLogout} />
          <View style={styles.rowSep} />
          <Row icon="trash-outline"   label="Delete account" onPress={handleDeleteAccount} danger />
        </View>

        {/* ── About section ── */}
        <SectionHeader label="About" />
        <View style={styles.card}>
          <View style={styles.aboutBlock}>
            <Text style={styles.aboutText}>
              TrackMyRead — your social reading companion. Log progress, share highlights, and discover your next favorite read.
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <AvatarPickerModal
        visible={showAvatarPicker}
        onClose={() => setShowAvatarPicker(false)}
        onSelect={handleSelectAvatar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },

  // Top bar with back button
  topBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.surface },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { ...type.titleLg, color: colors.onSurfaceVariant },

  scroll: { paddingHorizontal: 16, paddingBottom: 32 },

  sectionHeader: { ...type.eyebrow, color: colors.onSurfaceVariant, marginTop: 20, marginBottom: 8, marginLeft: 4 },
  card:          { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },

  // Profile hero (photo + name + email + buttons)
  profileHero:    { flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 16 },
  avatarWrap:     { flexShrink: 0 },
  avatarImg:      { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarFallback: { backgroundColor: colors.primary },
  avatarInitials: { fontFamily: 'NotoSerif_700Bold', fontSize: 24, fontWeight: '700', color: colors.onPrimary },
  profileName:    { ...type.title, color: colors.onSurface, marginBottom: 2 },
  profileEmail:   { ...type.label, color: colors.onSurfaceVariant, marginBottom: 10 },
  photoBtns:      { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  photoBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary + '60', backgroundColor: colors.primary + '08' },
  photoBtnText:   { ...type.label, color: colors.primary },

  row:      { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  rowIcon:  { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowIconDanger:  { backgroundColor: colors.error + '12' },
  rowBody:  { flex: 1 },
  rowLabel: { ...type.body, color: colors.onSurface },
  rowLabelDanger: { color: colors.error },
  rowDesc:  { ...type.label, color: colors.onSurfaceVariant, marginTop: 2, lineHeight: 16 },
  rowRight: { flexShrink: 0 },
  rowSep:   { height: 1, backgroundColor: colors.outlineVariant + '40', marginLeft: 62 },

  editBlock:  { padding: 16 },
  fieldLabel: { ...type.label, color: colors.onSurfaceVariant, marginBottom: 6 },
  input:      { ...type.body, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, color: colors.onSurface, borderWidth: 1, borderColor: colors.outlineVariant + '60' },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  editActions:{ flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn:  { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh, alignItems: 'center' },
  cancelBtnText: { ...type.body, fontFamily: 'Manrope_600SemiBold', fontWeight: '600', color: colors.onSurfaceVariant },
  saveBtn:    { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  saveBtnText: { ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onPrimary },
  savedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, justifyContent: 'center' },
  savedBadgeText: { ...type.bodySm, color: colors.primary, fontFamily: 'Manrope_600SemiBold', fontWeight: '600' },

  privateNotice:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 14, backgroundColor: colors.surfaceContainerLow, padding: 10, borderRadius: radius.md },
  privateNoticeText: { ...type.label, flex: 1, color: colors.onSurfaceVariant, lineHeight: 17 },

  aboutBlock: { padding: 16 },
  aboutText:  { ...type.body, color: colors.onSurfaceVariant },

  // Avatar picker modal
  pickerOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet:    { backgroundColor: colors.surfaceContainerLowest, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: 32 },
  pickerHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  pickerTitle:    { ...type.titleLg, color: colors.onSurface },
  pickerClose:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.surfaceContainerHigh },
  pickerGrid:     { paddingHorizontal: 16, gap: 10 },
  avatarTile:     { flex: 1, margin: 5, borderRadius: radius.lg, overflow: 'hidden', aspectRatio: 1 },
  avatarTileSelected: { borderWidth: 3, borderColor: colors.primary },
  avatarTileImg:  { width: '100%', height: '100%' },
  avatarTileCheck:{ position: 'absolute', bottom: 4, right: 4, backgroundColor: colors.surfaceContainerLowest, borderRadius: 10 },
  useAvatarBtn:   { marginHorizontal: 20, marginTop: 16, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.lg, alignItems: 'center' },
  useAvatarBtnText: { ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onPrimary },
});
