import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { notesAPI, userbooksAPI, userAPI } from '../services/api';
import { PreloadContext } from '../../App';
import { formatTimeAgo } from '../utils/bookUtils';
import { colors, radius, shadow } from '../theme';

// Hides itself when the image URL fails to load or returns a placeholder (e.g. Open Library 1x1 grey)
const PostImage = ({ uri, style }) => {
  const [failed, setFailed] = useState(false);
  if (failed || !uri) return null;
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode="contain"
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
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(!preloaded?.feed);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('community'); // 'community' or 'friends'
  const [showComposer, setShowComposer] = useState(false);
  const [postText, setPostText] = useState('');
  const [postQuote, setPostQuote] = useState('');
  const [showQuoteInput, setShowQuoteInput] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [posting, setPosting] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    if (!preloaded?.feed) {
      loadFeed();
    }
    loadFriendsReading();
    loadCurrentUser();
  }, []);

  // Reset to Community tab whenever the Home icon is tapped
  useFocusEffect(
    useCallback(() => {
      setActiveTab('community');
    }, [])
  );

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      await searchUsers();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchUsers = async () => {
    setSearching(true);
    try {
      const results = await userAPI.searchUsers(searchQuery);
      setSearchResults(results || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const loadFeed = async () => {
    try {
      setLoading(true);
      const data = await notesAPI.getCommunityFeed();
      setPosts(data || []);
    } catch (error) {
      console.error('Error loading feed:', error);
      Alert.alert('Error', 'Failed to load feed');
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentUser = async () => {
    try {
      const user = await userAPI.getProfile();
      setCurrentUser(user);
    } catch (error) {
      console.error('Error loading current user:', error);
    }
  };

  const loadFriendsReading = async () => {
    try {
      const data = await userbooksAPI.getFriendsReading();
      
      // Consolidate by friend - group all books by user
      const consolidatedMap = {};
      (data || []).forEach(item => {
        const userId = item.user?.id || item.user?.email;
        if (!consolidatedMap[userId]) {
          consolidatedMap[userId] = {
            user: item.user,
            books: []
          };
        }
        consolidatedMap[userId].books.push({
          id: item.id,
          book: item.book
        });
      });
      
      const consolidated = Object.values(consolidatedMap);
      setFriendsReading(consolidated);
    } catch (error) {
      console.error('Error loading friends reading:', error);
      // Silently fail - user might not have friends yet
    }
  };

  const handleFollow = async (userId) => {
    try {
      await userAPI.followUser(userId);
      
      // Update search results
      setSearchResults(prev =>
        prev.map(user =>
          user.id === userId
            ? { ...user, is_following: true, is_mutual: user.follows_you }
            : user
        )
      );

      // Reload friends reading
      await loadFriendsReading();
    } catch (error) {
      console.error('Follow error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to follow user');
    }
  };

  const handleUnfollow = async (userId) => {
    try {
      await userAPI.unfollowUser(userId);
      
      // Update search results
      setSearchResults(prev =>
        prev.map(user =>
          user.id === userId
            ? { ...user, is_following: false, is_mutual: false }
            : user
        )
      );

      // Reload friends reading
      await loadFriendsReading();
    } catch (error) {
      console.error('Unfollow error:', error);
      Alert.alert('Error', 'Failed to unfollow user');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadFeed(), loadFriendsReading()]);
    setRefreshing(false);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera roll permissions to upload images');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera permissions to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const showImageOptions = () => {
    Alert.alert(
      'Add Image',
      'Choose an option',
      [
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Gallery', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const handleCreatePost = async () => {
    if (!postText.trim()) {
      Alert.alert('Error', 'Please add some text');
      return;
    }

    setPosting(true);
    try {
      // Upload image if one is selected and not already a remote URL
      let imageUrl = null;
      if (selectedImage) {
        if (selectedImage.startsWith('http')) {
          imageUrl = selectedImage;
        } else {
          const uploaded = await notesAPI.uploadImage(selectedImage);
          imageUrl = uploaded.image_url;
        }
      }

      await notesAPI.createNote({
        text: postText.trim(),
        quote: postQuote.trim() || null,
        is_public: true,
        image_url: imageUrl,
      });
      Alert.alert('Success', 'Pulse shared successfully!');

      // Clear form
      setPostText('');
      setPostQuote('');
      setShowQuoteInput(false);
      setSelectedImage(null);
      setShowComposer(false);

      // Reload feed
      await loadFeed();
    } catch (error) {
      console.error('Error creating post:', error);
      Alert.alert('Error', 'Failed to create post');
    } finally {
      setPosting(false);
    }
  };

  const handleDeletePost = (post, isOwnPost, isAdmin) => {
    Alert.alert(
      'Delete Post',
      'Are you sure you want to delete this post?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await notesAPI.deleteNote(post.id);
              Alert.alert('Success', 'Post deleted successfully');
              await loadFeed();
            } catch (error) {
              console.error('Error deleting post:', error);
              Alert.alert('Error', 'Failed to delete post');
            }
          },
        },
      ]
    );
  };

  const renderFriendReading = (item) => {
    const userName = item.user?.name || item.user?.username || 'Unknown';
    const initials = userName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    const isMutual = item.user?.is_mutual || false;
    const bookCount = item.books?.length || 0;

    return (
      <View key={item.user?.id || item.user?.email} style={styles.friendReadingCard}>
        {/* Friend Header */}
        <View style={styles.friendReadingHeader}>
          <View style={styles.friendReadingAvatar}>
            <Text style={styles.friendReadingAvatarText}>{initials}</Text>
          </View>
          <View style={styles.friendReadingHeaderInfo}>
            <Text style={styles.friendReadingHeaderName}>
              {userName}
              {isMutual && <Text style={styles.mutualIndicator}> • Mutual</Text>}
            </Text>
            <Text style={styles.friendReadingStatus}>
              reading {bookCount} book{bookCount === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        {/* Books - Horizontal Scroll */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.booksScroll}
          contentContainerStyle={styles.booksScrollContent}
        >
          {item.books?.map((bookItem) => {
            const book = bookItem.book;
            const bookTitle = book?.title || 'Unknown Book';
            const bookAuthor = book?.author || 'Unknown Author';
            const bookCover = book?.cover_url || 'https://via.placeholder.com/100x150?text=No+Cover';

            return (
              <TouchableOpacity 
                key={bookItem.id}
                style={styles.bookCard}
                activeOpacity={0.7}
              >
                <View style={styles.bookCoverContainer}>
                  <Image source={{ uri: bookCover }} style={styles.friendReadingBookCover} />
                </View>
                <Text style={styles.bookCardTitle} numberOfLines={2}>
                  {bookTitle}
                </Text>
                <Text style={styles.bookCardAuthor} numberOfLines={1}>
                  {bookAuthor}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const handleLike = async (postId, isLiked) => {
    try {
      if (isLiked) {
        await notesAPI.unlikePost(postId);
      } else {
        await notesAPI.likePost(postId);
      }
      // Update local state
      setPosts(posts.map(post => 
        post.id === postId 
          ? {
              ...post,
              user_has_liked: !isLiked,
              likes_count: isLiked ? post.likes_count - 1 : post.likes_count + 1
            }
          : post
      ));
    } catch (error) {
      console.error('Error toggling like:', error);
      Alert.alert('Error', 'Failed to update like');
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const renderUserCard = (user) => {
    const initials = getInitials(user.name);
    const username = user.username || `user${user.id}`;

    return (
      <View 
        key={user.id} 
        style={styles.userCard}
      >
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>{initials}</Text>
        </View>
        
        <View style={styles.userInfoColumn}>
          <View style={styles.userNameRow}>
            <Text style={styles.userNameText}>{user.name}</Text>
            {user.is_mutual && (
              <View style={styles.userBadge}>
                <Text style={styles.userBadgeText}>Mutual</Text>
              </View>
            )}
            {user.follows_you && !user.is_mutual && (
              <View style={[styles.userBadge, styles.userBadgeSecondary]}>
                <Text style={styles.userBadgeText}>Follows you</Text>
              </View>
            )}
          </View>
          <Text style={styles.userUsername}>@{username}</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.followButton,
            user.is_following ? styles.followButtonActive : styles.followButtonInactive,
          ]}
          onPress={(e) => {
            e.stopPropagation();
            user.is_following
              ? handleUnfollow(user.id)
              : handleFollow(user.id);
          }}
        >
          <Text
            style={[
              styles.followButtonText,
              user.is_following && styles.followButtonTextActive,
            ]}
          >
            {user.is_following
              ? 'Following'
              : user.follows_you
              ? 'Follow Back'
              : 'Follow'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderPost = (post) => {
    // Defensive: skip null/undefined posts
    if (!post) return null;
    
    const userName = post.user?.name || post.user?.email || 'Unknown User';
    const timeAgo = post.updated_at && post.updated_at !== post.created_at
      ? `Edited ${formatTimeAgo(post.updated_at)}`
      : formatTimeAgo(post.created_at);
    const isOwnPost = currentUser && (post.user?.id === currentUser.id || post.user?.email === currentUser.email);
    const isAdmin = currentUser && currentUser.is_admin;

    return (
      <View key={post.id || Math.random().toString()} style={styles.postCard}>
        {/* User Info */}
        <View style={styles.postHeader}>
          <View style={styles.userInfo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(userName[0] || 'U').toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.userName}>{userName}</Text>
              <Text style={styles.timeAgo}>{timeAgo}</Text>
            </View>
          </View>
          {(isOwnPost || isAdmin) && (
            <View style={styles.postActions}>
              <TouchableOpacity onPress={() => handleDeletePost(post, isOwnPost, isAdmin)} style={styles.deleteButton}>
                <Text style={styles.deleteIcon}>🗑️</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Note Content */}
        {post.text && (
          <View style={styles.noteContent}>
            <Text style={styles.noteText}>{post.text}</Text>
          </View>
        )}

        {/* Note Image */}
        <PostImage uri={post.image_url} style={styles.noteImage} />

        {/* Quote */}
        {post.quote && (
          <View style={styles.quoteContainer}>
            <Text style={styles.quoteText}>"{post.quote}"</Text>
          </View>
        )}

        {/* Page Info */}
        {post.page_number && (
          <Text style={styles.pageInfo}>Page {post.page_number}</Text>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleLike(post.id, post.user_has_liked)}
          >
            <Text style={[styles.actionIcon, post.user_has_liked && styles.liked]}>
              {post.user_has_liked ? '❤️' : '🤍'}
            </Text>
            <Text style={styles.actionCount}>{post.likes_count || 0}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0066cc" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Tabs */}
      <View style={styles.header}>
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'community' && styles.activeTab]}
            onPress={() => setActiveTab('community')}
          >
            <Text style={[styles.tabText, activeTab === 'community' && styles.activeTabText]}>
              Community
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'friends' && styles.activeTab]}
            onPress={() => setActiveTab('friends')}
          >
            <Text style={[styles.tabText, activeTab === 'friends' && styles.activeTabText]}>
              Your Friends
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === 'community' ? (
          // Community Feed
          posts.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📚</Text>
              <Text style={styles.emptyText}>
                No posts yet.{'\n'}Be the first to share your reading journey!
              </Text>
            </View>
          ) : (
            posts.filter(p => p != null).map(post => renderPost(post))
          )
        ) : (
          // Friends/Following Tab
          <View style={styles.followingContainer}>
            {/* Search Section */}
            <View style={styles.searchSection}>
              <Text style={styles.sectionTitle}>Find Friends</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search users"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                placeholderTextColor="#999"
              />
              
              {searching && (
                <View style={styles.searchingIndicator}>
                  <ActivityIndicator size="small" color="#0066cc" />
                </View>
              )}

              {searchQuery.trim() !== '' && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={{ position: 'absolute', right: 12, top: 10 }}>
                  <Text style={{ fontSize: 18, color: '#999' }}>✕</Text>
                </TouchableOpacity>
              )}
              {searchQuery.trim() !== '' && searchResults.length > 0 && (
                <View style={styles.searchResults}>
                  {searchResults.map(user => renderUserCard(user))}
                </View>
              )}

              {searchQuery.trim() !== '' && !searching && searchResults.length === 0 && (
                <View style={styles.emptySearchState}>
                  <Text style={styles.emptySearchText}>No users found</Text>
                </View>
              )}
            </View>

            {/* What Friends Are Reading Section */}
            <View style={styles.friendsReadingSection}>
              <Text style={styles.sectionTitle}>What Friends Are Reading</Text>
              {friendsReading.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>👥</Text>
                  <Text style={styles.emptyText}>
                    No friends yet!{'\n'}Search and follow readers to see what they're reading.
                  </Text>
                </View>
              ) : (
                friendsReading.map(item => renderFriendReading(item))
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Floating Action Button - Only show on Community tab */}
      {activeTab === 'community' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowComposer(true)}
        >
          <Text style={styles.fabIcon}>✏️</Text>
        </TouchableOpacity>
      )}

      {/* Post Composer Modal */}
      <Modal
        visible={showComposer}
        animationType="slide"
        onRequestClose={() => setShowComposer(false)}
      >
        <View style={styles.modalContainer}>
          {/* Header stays fixed outside KAV so it never moves when keyboard opens */}
          <View style={styles.composerHeader}>
            <TouchableOpacity onPress={() => {
              setShowComposer(false);
              setPostText('');
              setPostQuote('');
              setSelectedImage(null);
              setShowQuoteInput(false);
            }}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.composerTitle}>Create Post</Text>
            <TouchableOpacity
              onPress={handleCreatePost}
              disabled={posting || !postText.trim()}
            >
              <Text
                style={[
                  styles.postButton,
                  (!postText.trim() || posting) && styles.postButtonDisabled,
                ]}
              >
                {posting ? 'Posting...' : 'Post'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* KAV only needed on iOS - Android Modal uses adjustResize natively */}
          <KeyboardAvoidingView
            behavior="padding"
            enabled={Platform.OS === 'ios'}
            style={{ flex: 1 }}
          >
            <ScrollView
              style={styles.composerContent}
              contentContainerStyle={styles.composerContentContainer}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <TextInput
                style={styles.postInput}
                placeholder="What are you feeling from your read?"
                placeholderTextColor="#999"
                value={postText}
                onChangeText={setPostText}
                multiline
                autoFocus
              />

              {selectedImage && (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: selectedImage }} style={styles.imagePreview} />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => setSelectedImage(null)}
                  >
                    <Text style={styles.removeImageText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              {showQuoteInput && (
                <View style={styles.quoteBox}>
                  <View style={styles.quoteHeader}>
                    <Text style={styles.quoteIcon}>💬 Quote</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setShowQuoteInput(false);
                        setPostQuote('');
                      }}
                    >
                      <Text style={styles.removeQuote}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.quoteInput}
                    placeholder="Add a quote from the book..."
                    placeholderTextColor="#999"
                    value={postQuote}
                    onChangeText={setPostQuote}
                    multiline
                  />
                </View>
              )}
            </ScrollView>

            <View style={styles.composerActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={showImageOptions}
              >
                <Text style={styles.actionIcon}>📷</Text>
                <Text style={styles.actionLabel}>Add Image</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => setShowQuoteInput(!showQuoteInput)}
              >
                <Text style={styles.actionIcon}>💬</Text>
                <Text style={styles.actionLabel}>
                  {showQuoteInput ? 'Remove Quote' : 'Add Quote'}
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: colors.surfaceContainerLowest,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '60',
    paddingTop: 50,
  },
  tabs: { flexDirection: 'row' },
  tab: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: colors.primary },
  tabText: { fontSize: 15, fontWeight: '500', color: colors.onSurfaceVariant },
  activeTabText: { color: colors.primary, fontWeight: '700' },
  scrollView: { flex: 1 },
  postCard: {
    backgroundColor: colors.surfaceContainerLowest,
    marginHorizontal: 12, marginVertical: 5,
    padding: 16, borderRadius: radius.lg,
    ...shadow.card,
  },
  postHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  postActions: { flexDirection: 'row', alignItems: 'center' },
  editButton: { padding: 4, marginRight: 8 },
  deleteButton: { padding: 4 },
  editIcon: { fontSize: 18 },
  deleteIcon: { fontSize: 18 },
  userInfo: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  avatarText: { color: colors.onPrimary, fontSize: 17, fontWeight: '700' },
  userName: { fontSize: 15, fontWeight: '600', color: colors.onSurface },
  timeAgo: { fontSize: 12, color: colors.outline, marginTop: 2 },
  bookInfo: {
    flexDirection: 'row', marginBottom: 12,
    backgroundColor: colors.surfaceContainerLow,
    padding: 10, borderRadius: radius.md,
  },
  bookCover: { width: 60, height: 90, borderRadius: 4, backgroundColor: colors.surfaceContainerHigh },
  bookDetails: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  bookTitle: { fontSize: 15, fontWeight: '600', color: colors.onSurface, marginBottom: 4 },
  bookAuthor: { fontSize: 13, color: colors.onSurfaceVariant },
  noteContent: { marginBottom: 8 },
  noteText: { fontSize: 15, color: colors.onSurface, lineHeight: 22 },
  noteImage: {
    width: '100%', aspectRatio: 2 / 3,
    borderRadius: radius.md, backgroundColor: colors.surfaceContainerLow, marginBottom: 8,
  },
  quoteContainer: {
    backgroundColor: colors.surfaceContainerLow,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
    padding: 12, borderRadius: 6, marginBottom: 8,
  },
  quoteText: { fontSize: 14, fontStyle: 'italic', color: colors.onSurfaceVariant, lineHeight: 20 },
  pageInfo: { fontSize: 13, color: colors.onSurfaceVariant, fontStyle: 'italic', marginBottom: 12 },
  actions: {
    flexDirection: 'row', paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.surfaceContainerHigh,
  },
  actionButton: { flexDirection: 'row', alignItems: 'center', marginRight: 20 },
  actionIcon: { fontSize: 20, marginRight: 6 },
  liked: { opacity: 1 },
  actionCount: { fontSize: 14, color: colors.onSurfaceVariant, fontWeight: '500' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 16, color: colors.outline, textAlign: 'center', lineHeight: 24 },
  fab: {
    position: 'absolute', right: 20, bottom: 20,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    ...shadow.float,
  },
  fabIcon: { fontSize: 26 },
  modalContainer: { flex: 1, backgroundColor: colors.surfaceContainerLowest },
  composerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '60',
    backgroundColor: colors.surfaceContainerLowest,
  },
  cancelButton: { fontSize: 16, color: colors.onSurfaceVariant },
  composerTitle: { fontSize: 18, fontWeight: '700', color: colors.onSurface },
  postButton: { fontSize: 16, color: colors.primary, fontWeight: '700' },
  postButtonDisabled: { color: colors.outlineVariant },
  composerContent: { flex: 1 },
  composerContentContainer: { padding: 20, flexGrow: 1 },
  postInput: { fontSize: 16, color: colors.onSurface, height: 120, textAlignVertical: 'top', marginBottom: 16 },
  quoteBox: {
    backgroundColor: colors.surfaceContainerLow,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
    padding: 12, borderRadius: radius.md, marginTop: 8,
  },
  quoteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  quoteIcon: { fontSize: 14, fontWeight: '600', color: colors.primary },
  removeQuote: { fontSize: 14, color: colors.outline },
  quoteInput: { fontSize: 15, color: colors.onSurface, height: 70, textAlignVertical: 'top' },
  composerActions: {
    flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: colors.outlineVariant + '60',
    backgroundColor: colors.surfaceContainerLowest,
  },
  actionLabel: { fontSize: 14, color: colors.onSurfaceVariant, fontWeight: '500' },
  imagePreviewContainer: { position: 'relative', marginBottom: 16 },
  imagePreview: { width: '100%', height: 200, borderRadius: radius.md, backgroundColor: colors.surfaceContainerHigh },
  removeImageButton: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  removeImageText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  friendReadingCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg, marginBottom: 14, marginHorizontal: 14,
    overflow: 'hidden', ...shadow.card,
  },
  friendReadingHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: 10 },
  friendReadingAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primaryContainer,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  friendReadingAvatarText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
  friendReadingHeaderInfo: { flex: 1 },
  friendReadingHeaderName: { fontSize: 15, fontWeight: '700', color: colors.onSurface, marginBottom: 2 },
  friendReadingStatus: { fontSize: 12, color: colors.primary, fontWeight: '500' },
  booksScroll: { paddingLeft: 14 },
  booksScrollContent: { paddingRight: 14, paddingBottom: 14 },
  bookCard: { marginRight: 12, width: 110 },
  bookCoverContainer: {
    borderRadius: radius.md, overflow: 'hidden',
    ...shadow.card, marginBottom: 6,
  },
  friendReadingBookCover: { width: 110, height: 165, borderRadius: radius.md },
  bookCardTitle: { fontSize: 12, fontWeight: '600', color: colors.onSurface, marginBottom: 2, lineHeight: 16 },
  bookCardAuthor: { fontSize: 11, color: colors.onSurfaceVariant },
  mutualIndicator: { color: colors.tertiary, fontSize: 12, fontWeight: '500' },
  friendCard: {
    backgroundColor: colors.surfaceContainerLowest, marginVertical: 4,
    padding: 16, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '40',
  },
  friendHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  friendAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  mutualAvatar: { borderWidth: 2, borderColor: colors.tertiary },
  friendAvatarText: { color: colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
  friendInfo: { flex: 1 },
  friendNameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  friendName: { fontSize: 16, fontWeight: '600', color: colors.onSurface, marginRight: 8 },
  mutualBadge: { backgroundColor: colors.tertiary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  mutualBadgeText: { color: colors.onTertiary, fontSize: 11, fontWeight: '600' },
  friendStatus: { fontSize: 13, color: colors.onSurfaceVariant },
  friendBook: { flexDirection: 'row', backgroundColor: colors.surfaceContainerLow, padding: 12, borderRadius: radius.md },
  friendBookCover: { width: 50, height: 75, borderRadius: 4, backgroundColor: colors.surfaceContainerHigh, marginRight: 12 },
  friendBookInfo: { flex: 1, justifyContent: 'center' },
  friendBookTitle: { fontSize: 15, fontWeight: '600', color: colors.onSurface, marginBottom: 4 },
  friendBookAuthor: { fontSize: 13, color: colors.onSurfaceVariant },
  followingContainer: { flex: 1 },
  searchSection: {
    backgroundColor: colors.surfaceContainerLowest, padding: 16,
    borderBottomWidth: 8, borderBottomColor: colors.surfaceContainerLow,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.onSurface, marginBottom: 12 },
  searchInput: {
    backgroundColor: colors.surfaceContainerLow, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: radius.md, fontSize: 15, color: colors.onSurface,
    borderWidth: 1, borderColor: colors.outlineVariant + '60',
  },
  searchingIndicator: { padding: 16, alignItems: 'center' },
  searchResults: { marginTop: 12 },
  emptySearchState: { padding: 20, alignItems: 'center' },
  emptySearchText: { fontSize: 14, color: colors.outline },
  userCard: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: colors.surfaceContainerHigh,
  },
  userAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  userAvatarText: { color: colors.onPrimary, fontSize: 16, fontWeight: 'bold' },
  userInfoColumn: { flex: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 },
  userNameText: { fontSize: 15, fontWeight: '600', color: colors.onSurface, marginRight: 6 },
  userBadge: {
    backgroundColor: colors.tertiaryContainer, paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: 10, marginRight: 4,
  },
  userBadgeSecondary: { backgroundColor: colors.primary + '20' },
  userBadgeText: { color: colors.tertiary, fontSize: 10, fontWeight: '600' },
  userUsername: { fontSize: 13, color: colors.onSurfaceVariant },
  followButton: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.md, minWidth: 84, alignItems: 'center' },
  followButtonInactive: { backgroundColor: colors.primary },
  followButtonActive: { backgroundColor: colors.surfaceContainerHigh },
  followButtonText: { fontSize: 13, fontWeight: '600', color: colors.onPrimary },
  followButtonTextActive: { color: colors.onSurfaceVariant },
  friendsReadingSection: { backgroundColor: colors.surfaceContainerLowest, padding: 16 },
});

export default FeedScreen;
