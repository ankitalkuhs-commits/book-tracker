import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity,
  Image, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { notesAPI, userbooksAPI, userAPI, booksAPI } from '../services/api';
import AppHeader from '../components/AppHeader';
import { PreloadContext } from '../../App';
import { formatTimeAgo } from '../utils/bookUtils';
import { colors, radius, shadow, type } from '../theme';

const PostImage = ({ uri, style }) => {
  const [failed, setFailed] = useState(false);
  if (failed || !uri) return null;
  return (
    <Image source={{ uri }} style={style} resizeMode="contain"
      onError={() => setFailed(true)}
      onLoad={(e) => {
        const { width, height } = e.nativeEvent.source;
        if (width <= 1 || height <= 1) setFailed(true);
      }}
    />
  );
};

const FeedScreen = ({ navigation }) => {
  const preloaded = useContext(PreloadContext);
  const [posts, setPosts] = useState(preloaded?.feed || []);
  const [friendsReading, setFriendsReading] = useState([]);
  const [recs, setRecs] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(!preloaded?.feed);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('community');

  // Composer state
  const [postText, setPostText] = useState('');
  const [postQuote, setPostQuote] = useState('');
  const [emotion, setEmotion] = useState('');
  const [userBooks, setUserBooks] = useState([]);
  const [selectedUserBook, setSelectedUserBook] = useState(null);
  const [showBookPicker, setShowBookPicker] = useState(false);
  const [posting, setPosting] = useState(false);

  // Image picker
  const [selectedImage, setSelectedImage] = useState(null);

  const [currentUser, setCurrentUser] = useState(null);
  const [menuPostId, setMenuPostId] = useState(null);
  const likingInFlight = useRef(new Set());

  // Comment state
  const [expandedComments, setExpandedComments] = useState({});  // postId → { comments, loading, text }

  // Shelf-book modal (recs + friends reading)
  const [shelfModal, setShelfModal] = useState(null);  // { book, reason } | null
  const [shelving, setShelving] = useState(false);

  useEffect(() => {
    if (!preloaded?.feed) loadFeed();
    loadFriendsReading();
    loadCurrentUser();
    loadUserBooks();
    loadRecommendations();
  }, []);

  useFocusEffect(useCallback(() => { setActiveTab('community'); }, []));

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(searchUsers, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchUsers = async () => {
    setSearching(true);
    try {
      const results = await userAPI.searchUsers(searchQuery);
      setSearchResults(results || []);
    } catch (error) { console.error('Search error:', error); }
    finally { setSearching(false); }
  };

  const loadFeed = async () => {
    try {
      setLoading(true);
      const data = await notesAPI.getCommunityFeed();
      setPosts(data || []);
    } catch (error) { Alert.alert('Error', 'Failed to load feed'); }
    finally { setLoading(false); }
  };

  const loadCurrentUser = async () => {
    try { setCurrentUser(await userAPI.getProfile()); } catch {}
  };

  const loadUserBooks = async () => {
    try {
      const data = await userbooksAPI.getMyBooks();
      setUserBooks(Array.isArray(data) ? data : []);
    } catch {}
  };

  const loadRecommendations = async () => {
    try {
      const data = await booksAPI.getRecommendations();
      setRecs(Array.isArray(data) ? data.slice(0, 8) : []);
    } catch {}
  };

  const loadFriendsReading = async () => {
    try {
      const data = await userbooksAPI.getFriendsReading();
      const map = {};
      (data || []).forEach(item => {
        const uid = item.user?.id || item.user?.email;
        if (!map[uid]) map[uid] = { user: item.user, books: [] };
        map[uid].books.push({ id: item.id, book: item.book });
      });
      setFriendsReading(Object.values(map));
    } catch {}
  };

  const handleFollow = async (userId) => {
    try {
      await userAPI.followUser(userId);
      setSearchResults(prev => prev.map(u => u.id === userId ? { ...u, is_following: true, is_mutual: u.follows_you } : u));
      loadFriendsReading();
    } catch (error) { Alert.alert('Error', error.response?.data?.detail || 'Failed to follow user'); }
  };

  const handleUnfollow = async (userId) => {
    try {
      await userAPI.unfollowUser(userId);
      setSearchResults(prev => prev.map(u => u.id === userId ? { ...u, is_following: false, is_mutual: false } : u));
      loadFriendsReading();
    } catch { Alert.alert('Error', 'Failed to unfollow user'); }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadFeed(), loadFriendsReading(), loadRecommendations()]);
    setRefreshing(false);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please grant camera roll permissions'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.8 });
    if (!result.canceled) setSelectedImage(result.assets[0].uri);
  };

  const handleCreatePost = async () => {
    if (!postText.trim()) { Alert.alert('Error', 'Please add some text'); return; }
    setPosting(true);
    try {
      let imageUrl = null;
      if (selectedImage) {
        if (selectedImage.startsWith('http')) imageUrl = selectedImage;
        else { const up = await notesAPI.uploadImage(selectedImage); imageUrl = up.image_url; }
      }
      await notesAPI.createNote({
        text: postText.trim(),
        quote: postQuote.trim() || null,
        emotion: emotion.trim() || null,
        is_public: true,
        image_url: imageUrl,
        userbook_id: selectedUserBook?.id || null,
      });
      setPostText(''); setPostQuote(''); setEmotion(''); setSelectedUserBook(null); setSelectedImage(null);
      loadFeed();
    } catch { Alert.alert('Error', 'Failed to post reflection'); }
    finally { setPosting(false); }
  };

  const handleDeletePost = (post) => {
    setMenuPostId(null);
    Alert.alert('Delete Post', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await notesAPI.deleteNote(post.id); loadFeed(); } catch { Alert.alert('Error', 'Failed to delete post'); }
      }},
    ]);
  };

  const handleLike = async (postId, isLiked) => {
    if (likingInFlight.current.has(postId)) return;
    likingInFlight.current.add(postId);
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, user_has_liked: !isLiked, likes_count: isLiked ? (p.likes_count || 1) - 1 : (p.likes_count || 0) + 1 }
      : p
    ));
    try {
      if (isLiked) await notesAPI.unlikePost(postId); else await notesAPI.likePost(postId);
    } catch {
      setPosts(prev => prev.map(p => p.id === postId
        ? { ...p, user_has_liked: isLiked, likes_count: isLiked ? (p.likes_count || 0) + 1 : (p.likes_count || 1) - 1 }
        : p
      ));
    } finally {
      likingInFlight.current.delete(postId);
    }
  };

  const toggleComments = async (postId) => {
    if (expandedComments[postId]) {
      setExpandedComments(prev => { const n = { ...prev }; delete n[postId]; return n; });
      return;
    }
    setExpandedComments(prev => ({ ...prev, [postId]: { comments: [], loading: true, text: '' } }));
    try {
      const data = await notesAPI.getComments(postId);
      setExpandedComments(prev => ({ ...prev, [postId]: { comments: Array.isArray(data) ? data : [], loading: false, text: '' } }));
    } catch {
      setExpandedComments(prev => ({ ...prev, [postId]: { comments: [], loading: false, text: '' } }));
    }
  };

  const handleCommentTextChange = (postId, text) => {
    setExpandedComments(prev => ({ ...prev, [postId]: { ...prev[postId], text } }));
  };

  const handlePostComment = async (postId) => {
    const state = expandedComments[postId];
    if (!state?.text?.trim()) return;
    try {
      const newComment = await notesAPI.addComment(postId, state.text.trim());
      setExpandedComments(prev => ({
        ...prev,
        [postId]: { ...prev[postId], comments: [...(prev[postId]?.comments || []), newComment], text: '' },
      }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p));
    } catch { Alert.alert('Error', 'Could not post comment'); }
  };

  const handleShelfBook = async (status) => {
    if (!shelfModal?.book) return;
    setShelving(true);
    try {
      const book = shelfModal.book;
      await booksAPI.addToLibrary({
        google_books_id: book.google_books_id || book.google_id || null,
        title: book.title,
        author: book.author || (Array.isArray(book.authors) ? book.authors.join(', ') : ''),
        cover_url: book.cover_url || null,
        total_pages: book.total_pages || null,
        status,
      });
      setShelfModal(null);
      Alert.alert('Added!', status === 'reading' ? 'Happy reading!' : 'Added to your Want to Read list.');
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not add book');
    } finally { setShelving(false); }
  };

  const getInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  const REASON_LABEL = {
    friends_reading: 'Friend is reading',
    friends_loved: 'Friend loved it',
    author_affinity: 'From an author you like',
  };

  const renderComposer = () => (
    <View style={styles.composerCard}>
      <View style={styles.composerRow}>
        {/* Avatar */}
        <View style={styles.composerAvatar}>
          <Text style={styles.composerAvatarText}>{getInitials(currentUser?.name || currentUser?.email || '')}</Text>
        </View>

        <View style={{ flex: 1 }}>
          {/* Text area */}
          <TextInput
            style={styles.composerInput}
            placeholder="What are your thoughts on your current read?"
            placeholderTextColor={colors.onSurfaceVariant + '80'}
            value={postText}
            onChangeText={setPostText}
            multiline
            numberOfLines={3}
          />

          {/* Tag a book */}
          {userBooks.length > 0 && (
            <View>
              <TouchableOpacity style={[styles.tagBookBtn, selectedUserBook && styles.tagBookBtnActive]} onPress={() => setShowBookPicker(v => !v)}>
                <MaterialCommunityIcons name="book-open-variant" size={14} color={selectedUserBook ? colors.primary : colors.onSurfaceVariant} />
                <Text style={[styles.tagBookText, selectedUserBook && styles.tagBookTextActive]} numberOfLines={1}>
                  {selectedUserBook ? selectedUserBook.book?.title : 'Tag a book (optional)'}
                </Text>
                {selectedUserBook && (
                  <TouchableOpacity onPress={() => setSelectedUserBook(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={14} color={colors.onSurfaceVariant} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              {showBookPicker && (
                <View style={styles.bookPickerDropdown}>
                  <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {userBooks.map(ub => (
                      <TouchableOpacity
                        key={ub.id}
                        style={styles.bookPickerItem}
                        onPress={() => { setSelectedUserBook(ub); setShowBookPicker(false); }}
                      >
                        <MaterialCommunityIcons name="book-outline" size={14} color={colors.secondary} />
                        <Text style={styles.bookPickerItemText} numberOfLines={1}>{ub.book?.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* Quote + emotion inputs */}
          <View style={styles.composerFields}>
            <View style={styles.composerFieldRow}>
              <MaterialCommunityIcons name="format-quote-open" size={16} color={colors.outline} style={styles.fieldIcon} />
              <TextInput
                style={styles.composerField}
                placeholder="Add a striking quote..."
                placeholderTextColor={colors.outline + '99'}
                value={postQuote}
                onChangeText={setPostQuote}
              />
            </View>
            <View style={styles.composerFieldRow}>
              <MaterialCommunityIcons name="emoticon-happy-outline" size={16} color={colors.outline} style={styles.fieldIcon} />
              <TextInput
                style={styles.composerField}
                placeholder="Current mood or emotion..."
                placeholderTextColor={colors.outline + '99'}
                value={emotion}
                onChangeText={setEmotion}
              />
            </View>
          </View>

          {/* Image preview */}
          {selectedImage && (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: selectedImage }} style={styles.imagePreview} />
              <TouchableOpacity style={styles.removeImageButton} onPress={() => setSelectedImage(null)}>
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {/* Actions row */}
          <View style={styles.composerActions}>
            <TouchableOpacity style={styles.composerActionBtn} onPress={pickImage}>
              <Ionicons name="image-outline" size={18} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.postReflectionBtn, (!postText.trim() || posting) && styles.postReflectionBtnDisabled]}
              onPress={handleCreatePost}
              disabled={!postText.trim() || posting}
            >
              {posting
                ? <ActivityIndicator size="small" color={colors.onPrimary} />
                : <Text style={styles.postReflectionText}>Post Reflection</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );

  const renderRecommendations = () => {
    if (!recs.length) return null;
    return (
      <View style={styles.recsSection}>
        <View style={styles.recsSectionHeader}>
          <Text style={styles.recsSectionTitle}>For You</Text>
          <Text style={styles.recsSectionSubtitle}>Based on your network</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recsScroll}>
          {recs.map(book => (
            <TouchableOpacity key={book.id} style={styles.recCard} activeOpacity={0.8}
              onPress={() => setShelfModal({ book, reason: REASON_LABEL[book.reason] || '' })}>
              <View style={styles.recCoverContainer}>
                {book.cover_url
                  ? <Image source={{ uri: book.cover_url }} style={styles.recCover} />
                  : <View style={[styles.recCover, styles.recCoverFallback]}><MaterialCommunityIcons name="book-open-variant" size={24} color={colors.outline} /></View>
                }
              </View>
              <Text style={styles.recTitle} numberOfLines={2}>{book.title}</Text>
              <Text style={styles.recReason}>{REASON_LABEL[book.reason] || ''}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderFriendReading = (item) => {
    const userName = item.user?.name || item.user?.username || 'Unknown';
    const initials = getInitials(userName);
    const bookCount = item.books?.length || 0;
    return (
      <View key={item.user?.id || item.user?.email} style={styles.friendReadingCard}>
        <View style={styles.friendReadingHeader}>
          <View style={styles.friendReadingAvatar}><Text style={styles.friendReadingAvatarText}>{initials}</Text></View>
          <View style={styles.friendReadingHeaderInfo}>
            <Text style={styles.friendReadingHeaderName}>{userName}</Text>
            <Text style={styles.friendReadingStatus}>reading {bookCount} book{bookCount === 1 ? '' : 's'}</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.booksScroll} contentContainerStyle={styles.booksScrollContent}>
          {item.books?.map((bookItem) => {
            const book = bookItem.book;
            return (
              <TouchableOpacity key={bookItem.id} style={styles.bookCard} activeOpacity={0.8}
                onPress={() => book && setShelfModal({ book, reason: `${item.user?.name || 'A friend'} is reading this` })}>
                <View style={styles.bookCoverContainer}>
                  {book?.cover_url
                    ? <Image source={{ uri: book.cover_url }} style={styles.friendReadingBookCover} />
                    : <View style={[styles.friendReadingBookCover, styles.friendBookFallback]}><Ionicons name="book-outline" size={28} color={colors.outline} /></View>
                  }
                </View>
                <Text style={styles.bookCardTitle} numberOfLines={2}>{book?.title || 'Unknown Book'}</Text>
                <Text style={styles.bookCardAuthor} numberOfLines={1}>{book?.author || ''}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderUserCard = (user) => {
    const displayName = user.name || user.username || 'Reader';
    const initials = getInitials(displayName);
    const username = user.username || `user${user.id}`;
    return (
      <View key={user.id} style={styles.userCard}>
        <View style={styles.userAvatar}><Text style={styles.userAvatarText}>{initials}</Text></View>
        <View style={styles.userInfoColumn}>
          <View style={styles.userNameRow}>
            <Text style={styles.userNameText}>{displayName}</Text>
            {user.is_mutual && <View style={styles.userBadge}><Text style={styles.userBadgeText}>Mutual</Text></View>}
            {user.follows_you && !user.is_mutual && <View style={[styles.userBadge, styles.userBadgeSecondary]}><Text style={styles.userBadgeText}>Follows you</Text></View>}
          </View>
          <Text style={styles.userUsername}>@{username}</Text>
        </View>
        <TouchableOpacity
          style={[styles.followButton, user.is_following ? styles.followButtonActive : styles.followButtonInactive]}
          onPress={(e) => { e.stopPropagation(); user.is_following ? handleUnfollow(user.id) : handleFollow(user.id); }}
        >
          <Text style={[styles.followButtonText, user.is_following && styles.followButtonTextActive]}>
            {user.is_following ? 'Following' : user.follows_you ? 'Follow Back' : 'Follow'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderPost = (post) => {
    if (!post) return null;
    const userName = post.user?.name || post.user?.email || 'Unknown User';
    const timeAgo = post.updated_at && post.updated_at !== post.created_at ? `Edited ${formatTimeAgo(post.updated_at)}` : formatTimeAgo(post.created_at);
    const isOwnPost = currentUser && (post.user?.id === currentUser.id || post.user?.email === currentUser.email);
    const isAdmin = currentUser?.is_admin;
    const showMenu = menuPostId === post.id;

    return (
      <View key={post.id || Math.random().toString()} style={styles.postCard}>
        <View style={styles.postHeader}>
          <TouchableOpacity
            style={styles.userInfo}
            onPress={() => post.user?.id && navigation.navigate('UserProfile', { userId: post.user.id })}
          >
            <View style={styles.avatar}><Text style={styles.avatarText}>{(userName[0] || 'U').toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              {post.book && (
                <Text style={styles.postBookLabel} numberOfLines={1}>
                  {post.book.title?.toUpperCase()}
                </Text>
              )}
              <Text style={styles.userName}>{userName}</Text>
              <Text style={styles.timeAgo}>{timeAgo}</Text>
            </View>
          </TouchableOpacity>
          {(isOwnPost || isAdmin) && (
            <View>
              <TouchableOpacity onPress={() => setMenuPostId(showMenu ? null : post.id)} style={styles.menuButton}>
                <Text style={styles.menuDots}>···</Text>
              </TouchableOpacity>
              {showMenu && (
                <View style={styles.menuDropdown}>
                  <TouchableOpacity style={styles.menuItem} onPress={() => handleDeletePost(post)}>
                    <Ionicons name="trash-outline" size={14} color={colors.error} />
                    <Text style={styles.menuItemTextDanger}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
        {post.text && <Text style={styles.noteText}>{post.text}</Text>}
        <PostImage uri={post.image_url} style={styles.noteImage} />
        {post.quote && <View style={styles.quoteContainer}><Text style={styles.quoteText}>"{post.quote}"</Text></View>}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionButton} onPress={() => handleLike(post.id, post.user_has_liked)}>
            <Ionicons
              name={post.user_has_liked ? 'heart' : 'heart-outline'}
              size={18}
              color={post.user_has_liked ? '#e53935' : colors.onSurfaceVariant}
            />
            <Text style={styles.actionCount}>{post.likes_count || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => toggleComments(post.id)}>
            <Ionicons name={expandedComments[post.id] ? 'chatbubble' : 'chatbubble-outline'} size={17}
              color={expandedComments[post.id] ? colors.primary : colors.onSurfaceVariant} />
            <Text style={[styles.actionCount, expandedComments[post.id] && { color: colors.primary }]}>
              {post.comments_count || 0}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Inline comments */}
        {expandedComments[post.id] && (
          <View style={styles.commentsSection}>
            {expandedComments[post.id].loading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 8 }} />
            ) : (
              expandedComments[post.id].comments.map((c, i) => (
                <View key={c.id || i} style={styles.commentRow}>
                  <View style={styles.commentAvatar}>
                    <Text style={styles.commentAvatarText}>{(c.user?.name?.[0] || c.user?.email?.[0] || 'U').toUpperCase()}</Text>
                  </View>
                  <View style={styles.commentBubble}>
                    <Text style={styles.commentName}>{c.user?.name || c.user?.username || 'Reader'}</Text>
                    <Text style={styles.commentText}>{c.text}</Text>
                  </View>
                </View>
              ))
            )}
            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment..."
                placeholderTextColor={colors.outline}
                value={expandedComments[post.id]?.text || ''}
                onChangeText={(t) => handleCommentTextChange(post.id, t)}
                returnKeyType="send"
                onSubmitEditing={() => handlePostComment(post.id)}
              />
              <TouchableOpacity
                style={[styles.commentPostBtn, !expandedComments[post.id]?.text?.trim() && { opacity: 0.4 }]}
                onPress={() => handlePostComment(post.id)}
                disabled={!expandedComments[post.id]?.text?.trim()}
              >
                <Text style={styles.commentPostBtnText}>Post</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderShelfModal = () => {
    if (!shelfModal) return null;
    const { book, reason } = shelfModal;
    return (
      <Modal visible animationType="slide" transparent onRequestClose={() => setShelfModal(null)}>
        <TouchableOpacity style={styles.shelfOverlay} activeOpacity={1} onPress={() => setShelfModal(null)} />
        <View style={styles.shelfSheet}>
          <View style={styles.shelfHandle} />
          <View style={styles.shelfBookRow}>
            {book.cover_url
              ? <Image source={{ uri: book.cover_url }} style={styles.shelfCover} />
              : <View style={[styles.shelfCover, styles.shelfCoverFallback]}><Ionicons name="book-outline" size={28} color={colors.outline} /></View>
            }
            <View style={{ flex: 1 }}>
              <Text style={styles.shelfTitle} numberOfLines={2}>{book.title}</Text>
              <Text style={styles.shelfAuthor} numberOfLines={1}>{book.author || ''}</Text>
              {reason ? <Text style={styles.shelfReason}>{reason}</Text> : null}
            </View>
          </View>
          <Text style={styles.shelfPrompt}>Where would you like to shelve this?</Text>
          <TouchableOpacity style={styles.shelfBtnPrimary} onPress={() => handleShelfBook('to-read')} disabled={shelving}>
            {shelving ? <ActivityIndicator size="small" color={colors.onPrimary} /> : (
              <>
                <Ionicons name="bookmark-outline" size={18} color={colors.onPrimary} style={{ marginRight: 8 }} />
                <Text style={styles.shelfBtnPrimaryText}>Want to Read</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.shelfBtnSecondary} onPress={() => handleShelfBook('reading')} disabled={shelving}>
            <Ionicons name="book-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.shelfBtnSecondaryText}>Start Reading Now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shelfCancelBtn} onPress={() => setShelfModal(null)}>
            <Text style={styles.shelfCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={styles.container}>
      {renderShelfModal()}
      <AppHeader
        user={currentUser}
        onBellPress={() => navigation.navigate('Notifications')}
        onAvatarPress={() => navigation.navigate('Profile')}
      />
      <View style={styles.tabBar}>
        <View style={styles.feedHeader}>
          <Text style={styles.feedEyebrow}>
            {activeTab === 'community' ? 'YOUR READING COMMUNITY' : 'YOUR READING CIRCLE'}
          </Text>
        </View>
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, activeTab === 'community' && styles.activeTab]} onPress={() => setActiveTab('community')}>
            <Text style={[styles.tabText, activeTab === 'community' && styles.activeTabText]}>Community</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'friends' && styles.activeTab]} onPress={() => setActiveTab('friends')}>
            <Text style={[styles.tabText, activeTab === 'friends' && styles.activeTabText]}>Friends</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === 'community' ? (
          <>
            {renderComposer()}
            {renderRecommendations()}
            {posts.length === 0 ? (
              <View style={styles.emptyState}><Text style={styles.emptyIcon}>📚</Text><Text style={styles.emptyText}>No posts yet.{'\n'}Be the first to share your reading journey!</Text></View>
            ) : posts.filter(p => p != null).map(post => renderPost(post))}
          </>
        ) : (
          <View style={styles.followingContainer}>
            <View style={styles.searchSection}>
              <Text style={styles.sectionTitle}>Find Friends</Text>
              <TextInput style={styles.searchInput} placeholder="Search users" value={searchQuery} onChangeText={setSearchQuery} autoCapitalize="none" placeholderTextColor="#999" />
              {searching && <View style={styles.searchingIndicator}><ActivityIndicator size="small" color={colors.primary} /></View>}
              {searchQuery.trim() !== '' && searchResults.length > 0 && <View style={styles.searchResults}>{searchResults.map(renderUserCard)}</View>}
              {searchQuery.trim() !== '' && !searching && searchResults.length === 0 && <View style={styles.emptySearchState}><Text style={styles.emptySearchText}>No users found</Text></View>}
            </View>
            <View style={styles.friendsReadingSection}>
              <Text style={styles.sectionTitle}>What Friends Are Reading</Text>
              {friendsReading.length === 0 ? (
                <View style={styles.emptyState}><Text style={styles.emptyIcon}>👥</Text><Text style={styles.emptyText}>No friends yet!{'\n'}Search and follow readers to see what they're reading.</Text></View>
              ) : friendsReading.map(renderFriendReading)}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabBar: { backgroundColor: colors.surfaceContainerLowest, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '60' },
  feedHeader: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  feedEyebrow: { ...type.eyebrow, color: colors.secondary },
  tabs: { flexDirection: 'row' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: colors.primary },
  tabText: { ...type.body, color: colors.onSurfaceVariant },
  activeTabText: { color: colors.primary, fontFamily: 'Manrope_700Bold', fontWeight: '700' },
  scrollView: { flex: 1 },

  // Inline composer
  composerCard: { backgroundColor: colors.surfaceContainerLowest, margin: 12, borderRadius: radius.lg, padding: 14, ...shadow.card },
  composerRow: { flexDirection: 'row', gap: 12 },
  composerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  composerAvatarText: { ...type.label, color: colors.onPrimary },
  composerInput: {
    ...type.body, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, padding: 12,
    color: colors.onSurface, minHeight: 80, textAlignVertical: 'top', marginBottom: 10,
  },
  tagBookBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, marginBottom: 10, alignSelf: 'flex-start',
  },
  tagBookBtnActive: { backgroundColor: colors.primary + '18' },
  tagBookText: { ...type.bodySm, color: colors.onSurfaceVariant, flex: 1 },
  tagBookTextActive: { color: colors.primary, fontFamily: 'Manrope_600SemiBold', fontWeight: '600' },
  bookPickerDropdown: {
    backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.md, marginBottom: 10,
    borderWidth: 1, borderColor: colors.outlineVariant + '60', ...shadow.card,
  },
  bookPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.surfaceContainerHigh },
  bookPickerItemText: { ...type.bodySm, color: colors.onSurface, flex: 1 },
  composerFields: { gap: 8, marginBottom: 10 },
  composerFieldRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8 },
  fieldIcon: { marginRight: 8 },
  composerField: { ...type.bodySm, flex: 1, color: colors.onSurface },
  composerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  composerActionBtn: { padding: 6 },
  postReflectionBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 9 },
  postReflectionBtnDisabled: { opacity: 0.45 },
  postReflectionText: { ...type.label, color: colors.onPrimary, fontFamily: 'Manrope_700Bold', fontWeight: '700' },
  imagePreviewContainer: { position: 'relative', marginBottom: 10 },
  imagePreview: { width: '100%', height: 160, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh },
  removeImageButton: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  // For You recs
  recsSection: { marginHorizontal: 12, marginBottom: 12 },
  recsSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  recsSectionTitle: { ...type.title, color: colors.onSurface, fontFamily: 'NotoSerif_700Bold' },
  recsSectionSubtitle: { ...type.caption, color: colors.onSurfaceVariant + '80' },
  recsScroll: { paddingBottom: 4 },
  recCard: { width: 100, marginRight: 12 },
  recCoverContainer: { borderRadius: radius.md, overflow: 'hidden', marginBottom: 6, ...shadow.card },
  recCover: { width: 100, height: 150, borderRadius: radius.md },
  recCoverFallback: { backgroundColor: colors.surfaceContainerHigh, justifyContent: 'center', alignItems: 'center' },
  recTitle: { ...type.caption, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onSurface, lineHeight: 15, marginBottom: 2 },
  recReason: { ...type.eyebrow, color: colors.secondary, textTransform: 'none', letterSpacing: 0 },

  // Post cards
  postCard: { backgroundColor: colors.surfaceContainerLowest, marginHorizontal: 12, marginVertical: 5, padding: 16, borderRadius: radius.lg, ...shadow.card },
  postHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  userInfo: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avatarText: { ...type.title, color: colors.onPrimary },
  postBookLabel: { ...type.eyebrow, color: colors.secondary, letterSpacing: 0.5, marginBottom: 1 },
  userName: { ...type.body, fontFamily: 'Manrope_600SemiBold', fontWeight: '600', color: colors.onSurface },
  timeAgo: { ...type.caption, color: colors.outline, marginTop: 1 },
  menuButton: { padding: 4, paddingHorizontal: 8 },
  menuDots: { ...type.titleLg, color: colors.onSurfaceVariant, letterSpacing: 2 },
  menuDropdown: { position: 'absolute', right: 0, top: 28, backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.md, paddingVertical: 4, minWidth: 120, zIndex: 100, ...shadow.float, borderWidth: 1, borderColor: colors.outlineVariant + '40' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  menuItemTextDanger: { ...type.body, color: colors.error },
  noteText: { ...type.body, color: colors.onSurface, marginBottom: 10 },
  noteImage: { width: '100%', aspectRatio: 2 / 3, borderRadius: radius.md, backgroundColor: colors.surfaceContainerLow, marginBottom: 10 },
  quoteContainer: { backgroundColor: colors.surfaceContainerLow, borderLeftWidth: 3, borderLeftColor: colors.primary, padding: 12, borderRadius: 6, marginBottom: 10 },
  quoteText: { ...type.body, fontFamily: 'NotoSerif_400Italic', color: colors.onSurfaceVariant },
  actionsRow: { flexDirection: 'row', paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.surfaceContainerHigh, gap: 20 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionCount: { ...type.bodySm, color: colors.onSurfaceVariant },

  // Comments
  commentsSection: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.surfaceContainerHigh, paddingTop: 10 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primaryContainer, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  commentAvatarText: { ...type.caption, color: colors.onPrimary, fontFamily: 'Manrope_700Bold', fontWeight: '700' },
  commentBubble: { flex: 1, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 },
  commentName: { ...type.caption, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onSurface, marginBottom: 2 },
  commentText: { ...type.bodySm, color: colors.onSurface },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  commentInput: { flex: 1, ...type.bodySm, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8, color: colors.onSurface },
  commentPostBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full },
  commentPostBtnText: { ...type.label, color: colors.onPrimary },

  // Shelf-book modal
  shelfOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  shelfSheet: { backgroundColor: colors.surfaceContainerLowest, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  shelfHandle: { width: 40, height: 4, backgroundColor: colors.outlineVariant, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  shelfBookRow: { flexDirection: 'row', gap: 14, marginBottom: 20 },
  shelfCover: { width: 72, height: 108, borderRadius: radius.md },
  shelfCoverFallback: { backgroundColor: colors.surfaceContainerHigh, justifyContent: 'center', alignItems: 'center' },
  shelfTitle: { ...type.titleLg, color: colors.onSurface, marginBottom: 4 },
  shelfAuthor: { ...type.body, color: colors.onSurfaceVariant, marginBottom: 4 },
  shelfReason: { ...type.eyebrow, color: colors.secondary },
  shelfPrompt: { ...type.body, color: colors.onSurfaceVariant, textAlign: 'center', marginBottom: 16 },
  shelfBtnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 14, marginBottom: 12 },
  shelfBtnPrimaryText: { ...type.title, color: colors.onPrimary },
  shelfBtnSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, paddingVertical: 14, borderWidth: 1.5, borderColor: colors.primary, marginBottom: 12 },
  shelfBtnSecondaryText: { ...type.title, color: colors.primary },
  shelfCancelBtn: { alignItems: 'center', paddingVertical: 10 },
  shelfCancelText: { ...type.body, color: colors.onSurfaceVariant },

  // Friends book fallback
  friendBookFallback: { backgroundColor: colors.surfaceContainerHigh, justifyContent: 'center', alignItems: 'center' },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { ...type.title, color: colors.outline, textAlign: 'center' },
  followingContainer: { flex: 1 },
  searchSection: { backgroundColor: colors.surfaceContainerLowest, padding: 16, borderBottomWidth: 8, borderBottomColor: colors.surfaceContainerLow },
  sectionTitle: { ...type.title, fontFamily: 'NotoSerif_700Bold', color: colors.onSurface, marginBottom: 12 },
  searchInput: { ...type.body, backgroundColor: colors.surfaceContainerLow, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.md, color: colors.onSurface, borderWidth: 1, borderColor: colors.outlineVariant + '60' },
  searchingIndicator: { padding: 16, alignItems: 'center' },
  searchResults: { marginTop: 12 },
  emptySearchState: { padding: 20, alignItems: 'center' },
  emptySearchText: { ...type.body, color: colors.outline },
  userCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.surfaceContainerHigh },
  userAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  userAvatarText: { ...type.label, color: colors.onPrimary, fontFamily: 'Manrope_700Bold', fontWeight: '700' },
  userInfoColumn: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 },
  userNameText: { ...type.body, fontFamily: 'Manrope_600SemiBold', fontWeight: '600', color: colors.onSurface, marginRight: 6 },
  userBadge: { backgroundColor: colors.tertiaryContainer, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginRight: 4 },
  userBadgeSecondary: { backgroundColor: colors.primary + '20' },
  userBadgeText: { ...type.eyebrow, color: colors.tertiary, textTransform: 'none', letterSpacing: 0 },
  userUsername: { ...type.bodySm, color: colors.onSurfaceVariant },
  followButton: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.md, minWidth: 84, alignItems: 'center' },
  followButtonInactive: { backgroundColor: colors.primary },
  followButtonActive: { backgroundColor: colors.surfaceContainerHigh },
  followButtonText: { ...type.label, color: colors.onPrimary },
  followButtonTextActive: { color: colors.onSurfaceVariant },
  friendReadingCard: { backgroundColor: colors.surfaceContainerLowest, borderRadius: radius.lg, marginBottom: 14, marginHorizontal: 14, overflow: 'hidden', ...shadow.card },
  friendReadingHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: 10 },
  friendReadingAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryContainer, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  friendReadingAvatarText: { ...type.label, color: colors.onPrimary, fontFamily: 'Manrope_700Bold', fontWeight: '700' },
  friendReadingHeaderInfo: { flex: 1 },
  friendReadingHeaderName: { ...type.body, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: colors.onSurface, marginBottom: 2 },
  friendReadingStatus: { ...type.label, color: colors.primary },
  booksScroll: { paddingLeft: 14 },
  booksScrollContent: { paddingRight: 14, paddingBottom: 14 },
  bookCard: { marginRight: 12, width: 110 },
  bookCoverContainer: { borderRadius: radius.md, overflow: 'hidden', ...shadow.card, marginBottom: 6 },
  friendReadingBookCover: { width: 110, height: 165, borderRadius: radius.md },
  bookCardTitle: { ...type.label, color: colors.onSurface, marginBottom: 2, lineHeight: 16 },
  bookCardAuthor: { ...type.caption, color: colors.onSurfaceVariant },
  friendsReadingSection: { backgroundColor: colors.surfaceContainerLowest, padding: 16 },
});

export default FeedScreen;
