import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, StatusBar, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { groupsAPI } from '../services/api';
import { colors, radius, shadow } from '../theme';

const COVER_COLORS = {
  teal:   { bg: '#e0f2f1', text: '#00464a' },
  amber:  { bg: '#fff8e1', text: '#735c00' },
  rose:   { bg: '#fce4ec', text: '#880e4f' },
  indigo: { bg: '#e8eaf6', text: '#283593' },
  green:  { bg: '#e8f5e9', text: '#1b5e20' },
};

function GroupCover({ preset = 'teal', size = 48 }) {
  const c = COVER_COLORS[preset] || COVER_COLORS.teal;
  return <View style={[styles.cover, { width: size, height: size, borderRadius: size / 4, backgroundColor: c.bg }]}><Ionicons name="book" size={size * 0.4} color={c.text} /></View>;
}

function GroupCard({ group, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <GroupCover preset={group.cover_preset} size={56} />
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>{group.name}</Text>
        {group.description ? <Text style={styles.cardDesc} numberOfLines={2}>{group.description}</Text> : null}
        <View style={styles.cardMeta}>
          <Ionicons name="people-outline" size={13} color={colors.onSurfaceVariant} />
          <Text style={styles.cardMetaText}>{group.member_count ?? 0} members</Text>
          {group.is_private && (<><View style={styles.metaDot} /><Ionicons name="lock-closed-outline" size={13} color={colors.onSurfaceVariant} /><Text style={styles.cardMetaText}>Private</Text></>)}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.outline} />
    </TouchableOpacity>
  );
}

function CreateGroupModal({ visible, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [preset, setPreset] = useState('teal');
  const [saving, setSaving] = useState(false);
  const presets = Object.keys(COVER_COLORS);

  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      const g = await groupsAPI.createGroup({ name: name.trim(), description: desc.trim(), is_private: isPrivate, cover_preset: preset });
      onCreated(g);
      setName(''); setDesc(''); setIsPrivate(false); setPreset('teal');
      onClose();
    } catch (e) { Alert.alert('Error', e?.response?.data?.detail || 'Could not create group'); }
    setSaving(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>New Reading Circle</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.onSurface} /></TouchableOpacity>
        </View>
        <Text style={styles.fieldLabel}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Circle name…" placeholderTextColor={colors.outline} maxLength={60} />
        <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Description (optional)</Text>
        <TextInput style={[styles.input, styles.inputMulti]} value={desc} onChangeText={setDesc} placeholder="What's this circle about?" placeholderTextColor={colors.outline} multiline numberOfLines={3} />
        <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Color</Text>
        <View style={styles.presetRow}>
          {presets.map(p => {
            const c = COVER_COLORS[p];
            return <TouchableOpacity key={p} onPress={() => setPreset(p)} style={[styles.presetSwatch, { backgroundColor: c.bg }, preset === p && { borderWidth: 2.5, borderColor: c.text }]} />;
          })}
        </View>
        <View style={styles.privacyRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyLabel}>Private circle</Text>
            <Text style={styles.privacySub}>Members must be invited</Text>
          </View>
          <TouchableOpacity style={[styles.toggle, isPrivate && styles.toggleOn]} onPress={() => setIsPrivate(v => !v)}>
            <View style={[styles.toggleThumb, isPrivate && styles.toggleThumbOn]} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={saving}>
          <Text style={styles.createBtnText}>{saving ? 'Creating…' : 'Create Circle'}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function JoinModal({ visible, onClose, onJoined }) {
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
          <Text style={styles.modalTitle}>Join by Invite Code</Text>
          <TextInput style={[styles.input, { marginTop: 16, marginBottom: 12 }]} value={code} onChangeText={setCode} placeholder="Enter invite code…" placeholderTextColor={colors.outline} autoCapitalize="none" />
          <TouchableOpacity style={styles.createBtn} onPress={handleJoin} disabled={joining}>
            <Text style={styles.createBtnText}>{joining ? 'Joining…' : 'Join Circle'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ marginTop: 10, alignItems: 'center' }}>
            <Text style={{ color: colors.onSurfaceVariant, fontSize: 14 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function GroupsScreen({ navigation }) {
  const [myGroups, setMyGroups] = useState([]);
  const [discover, setDiscover] = useState([]);
  const [tab, setTab] = useState('mine');
  const [discoverQ, setDiscoverQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const loadMine = useCallback(async () => { try { const data = await groupsAPI.getMyGroups(); setMyGroups(Array.isArray(data) ? data : []); } catch { setMyGroups([]); } }, []);
  const loadDiscover = useCallback(async (q = '') => { try { const data = await groupsAPI.discoverGroups(q); setDiscover(Array.isArray(data) ? data : []); } catch { setDiscover([]); } }, []);
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    await Promise.all([loadMine(), loadDiscover(discoverQ)]);
    setLoading(false); setRefreshing(false);
  }, [discoverQ]);

  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(() => { if (tab === 'discover') loadDiscover(discoverQ); }, 350); return () => clearTimeout(t); }, [discoverQ, tab]);

  const activeData = tab === 'mine' ? myGroups : discover;

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>COMMUNITY</Text>
          <Text style={styles.headerTitle}>Reading Circles</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => setShowJoin(true)}><Ionicons name="enter-outline" size={20} color={colors.primary} /></TouchableOpacity>
          <TouchableOpacity style={[styles.headerBtn, styles.headerBtnPrimary]} onPress={() => setShowCreate(true)}><Ionicons name="add" size={20} color={colors.onPrimary} /></TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabs}>
        {['mine', 'discover'].map(t => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'mine' ? 'My Circles' : 'Discover'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'discover' && (
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.outline} style={{ marginLeft: 14 }} />
          <TextInput style={styles.searchInput} value={discoverQ} onChangeText={setDiscoverQ} placeholder="Search circles…" placeholderTextColor={colors.outline} />
        </View>
      )}

      <FlatList
        data={activeData}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => <GroupCard group={item} onPress={() => navigation.navigate('GroupDetail', { groupId: item.id })} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={56} color={colors.outlineVariant} />
            <Text style={styles.emptyTitle}>{tab === 'mine' ? 'No circles yet' : 'No circles found'}</Text>
            <Text style={styles.emptySub}>{tab === 'mine' ? 'Create one or join with an invite code' : 'Try a different search'}</Text>
          </View>
        }
      />

      <CreateGroupModal visible={showCreate} onClose={() => setShowCreate(false)} onCreated={g => { setMyGroups(prev => [g, ...prev]); setTab('mine'); }} />
      <JoinModal visible={showJoin} onClose={() => setShowJoin(false)} onJoined={g => { setMyGroups(prev => [g, ...prev]); setTab('mine'); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12, backgroundColor: colors.surface },
  headerLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: colors.secondary, marginBottom: 2 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: colors.primary },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },
  headerBtnPrimary: { backgroundColor: colors.primary },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  tab: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surfaceContainerHigh },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.onSurfaceVariant },
  tabTextActive: { color: colors.onPrimary },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceContainerLow, borderRadius: radius.lg, marginHorizontal: 16, marginBottom: 12, gap: 8 },
  searchInput: { flex: 1, paddingVertical: 10, paddingRight: 14, fontSize: 14, color: colors.onSurface },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, padding: 14, gap: 12, ...shadow.card },
  cover: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardBody: { flex: 1, gap: 3 },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.onSurface },
  cardDesc: { fontSize: 12, color: colors.onSurfaceVariant, lineHeight: 17 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cardMetaText: { fontSize: 12, color: colors.onSurfaceVariant },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.outline },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.onSurface, marginTop: 8 },
  emptySub: { fontSize: 13, color: colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 32 },
  modalContainer: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 20, paddingTop: 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: colors.primary },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.onSurfaceVariant, marginBottom: 6 },
  input: { backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.onSurface, borderWidth: 1, borderColor: colors.outlineVariant + '60' },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  presetRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  presetSwatch: { width: 36, height: 36, borderRadius: 18 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 12 },
  privacyLabel: { fontSize: 14, fontWeight: '600', color: colors.onSurface },
  privacySub: { fontSize: 12, color: colors.onSurfaceVariant },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.outlineVariant, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.primary },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  toggleThumbOn: { alignSelf: 'flex-end' },
  createBtn: { marginTop: 24, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center' },
  createBtnText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  joinOverlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  joinSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
});
