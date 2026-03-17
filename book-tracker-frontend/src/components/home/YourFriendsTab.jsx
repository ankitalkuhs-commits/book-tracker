// YourFriendsTab - Inline friends tab matching mobile "Your Friends" screen
import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, BACKEND } from '../../services/api';

// Consistent color per user name
const getAvatarColor = (name) => {
  const colors = [
    '#1a73e8', '#e91e63', '#9c27b0', '#3f51b5',
    '#009688', '#ff5722', '#795548', '#607d8b',
    '#f44336', '#4caf50'
  ];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

function UserCard({ user, onFollowChange }) {
  const [isFollowing, setIsFollowing] = useState(user.is_following || false);
  const [isMutual, setIsMutual] = useState(user.is_mutual || false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    setIsFollowing(user.is_following || false);
    setIsMutual(user.is_mutual || false);
  }, [user.is_following, user.is_mutual]);

  const handleToggle = async () => {
    setProcessing(true);
    try {
      if (isFollowing) {
        await apiFetch(`/follow/${user.id}`, { method: 'DELETE' });
        setIsFollowing(false);
        setIsMutual(false);
      } else {
        const data = await apiFetch(`/follow/${user.id}`, { method: 'POST' });
        setIsFollowing(data.is_following || true);
        setIsMutual(data.is_mutual || false);
      }
      if (onFollowChange) onFollowChange();
    } catch (err) {
      console.error('Follow error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const username = user.username || `user${user.id}`;
  const buttonLabel = processing ? '...' : isFollowing ? 'Following' : (user.is_follower ? 'Follow Back' : 'Follow');

  return (
    <div style={styles.userCard}>
      <div style={{ ...styles.userAvatar, background: getAvatarColor(user.name) }}>
        {getInitials(user.name)}
      </div>
      <div style={styles.userInfo}>
        <div style={styles.userNameRow}>
          <span style={styles.userName}>{user.name}</span>
          {isMutual && <span style={styles.mutualBadge}>Mutual</span>}
          {user.is_follower && !isMutual && <span style={styles.followerBadge}>Follows you</span>}
        </div>
        <span style={styles.userHandle}>@{username}</span>
      </div>
      <button
        onClick={handleToggle}
        disabled={processing}
        style={isFollowing ? styles.followingBtn : styles.followBtn}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function FriendReadingCard({ item }) {
  const userName = item.user?.name || item.user?.username || 'Unknown';
  const isMutual = item.user?.is_mutual || false;
  const books = item.books || [];

  return (
    <div style={styles.friendCard}>
      <div style={styles.friendCardHeader}>
        <div style={{ ...styles.friendAvatar, background: getAvatarColor(userName) }}>
          {getInitials(userName)}
        </div>
        <div>
          <div style={styles.friendNameRow}>
            <span style={styles.friendName}>{userName}</span>
            {isMutual && <span style={styles.mutualBadge}>Mutual</span>}
          </div>
          <span style={styles.readingCount}>
            reading {books.length} book{books.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div style={styles.booksRow}>
        {books.map((bookItem) => {
          const book = bookItem.book;
          const coverUrl = book?.cover_url;
          const title = book?.title || 'Unknown';
          const author = book?.author || '';
          return (
            <div key={bookItem.id} style={styles.bookCard}>
              {coverUrl ? (
                <img
                  src={coverUrl.startsWith('http') ? coverUrl : `${BACKEND}${coverUrl}`}
                  alt={title}
                  style={styles.bookCover}
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                />
              ) : null}
              <div style={{ ...styles.bookCoverFallback, display: coverUrl ? 'none' : 'flex' }}>
                📖
              </div>
              <span style={styles.bookTitle}>{title}</span>
              <span style={styles.bookAuthor}>{author.length > 18 ? author.slice(0, 16) + '…' : author}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function YourFriendsTab({ currentUser }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [friendsReading, setFriendsReading] = useState([]);

  const loadFriendsReading = useCallback(async () => {
    if (!currentUser) return;
    try {
      const data = await apiFetch('/userbooks/friends/currently-reading?limit=20');
      // Consolidate books by user
      const map = {};
      (data || []).forEach(item => {
        const uid = item.user?.id || item.user?.email;
        if (!map[uid]) map[uid] = { user: item.user, books: [] };
        map[uid].books.push({ id: item.id, book: item.book });
      });
      setFriendsReading(Object.values(map));
    } catch (err) {
      console.error('Error loading friends reading:', err);
    }
  }, [currentUser]);

  useEffect(() => {
    loadFriendsReading();
  }, [loadFriendsReading]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiFetch(`/users/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(data || []);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (!currentUser) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#6B7280' }}>Sign in to find friends and see what they're reading.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Find Friends */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Find Friends</h3>
        <div style={styles.searchRow}>
          <input
            type="text"
            placeholder="Search users"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={styles.clearBtn}>✕</button>
          )}
        </div>
        {searching && <div style={styles.hint}>Searching…</div>}
        {!searching && searchQuery && searchResults.length === 0 && (
          <div style={styles.hint}>No users found</div>
        )}
        {searchResults.length > 0 && (
          <div style={styles.resultList}>
            {searchResults.map(u => (
              <UserCard key={u.id} user={u} onFollowChange={loadFriendsReading} />
            ))}
          </div>
        )}
      </div>

      {/* What Friends Are Reading */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>What Friends Are Reading</h3>
        {friendsReading.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
            <p style={{ color: '#6B7280', margin: 0 }}>No friends yet!</p>
            <p style={{ color: '#9CA3AF', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Search and follow readers to see what they're reading.
            </p>
          </div>
        ) : (
          friendsReading.map(item => (
            <FriendReadingCard key={item.user?.id || item.user?.email} item={item} />
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  section: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    padding: '1.25rem',
    marginBottom: '1rem',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: '700',
    color: '#1a202c',
    margin: '0 0 0.75rem 0',
  },
  searchRow: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchInput: {
    width: '100%',
    padding: '0.625rem 2.5rem 0.625rem 0.875rem',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    fontSize: '0.95rem',
    backgroundColor: '#F9FAFB',
    outline: 'none',
    boxSizing: 'border-box',
  },
  clearBtn: {
    position: 'absolute',
    right: '0.75rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#9CA3AF',
    fontSize: '1rem',
    padding: 0,
  },
  hint: {
    marginTop: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    padding: '0.5rem 0',
  },
  resultList: {
    marginTop: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  // User card
  userCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.625rem 0',
    borderBottom: '1px solid #F3F4F6',
  },
  userAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontWeight: '700',
    fontSize: '0.875rem',
    flexShrink: 0,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    flexWrap: 'wrap',
  },
  userName: {
    fontWeight: '600',
    color: '#1a202c',
    fontSize: '0.95rem',
  },
  userHandle: {
    color: '#9CA3AF',
    fontSize: '0.8rem',
  },
  mutualBadge: {
    background: '#EDE9FE',
    color: '#7C3AED',
    fontSize: '0.7rem',
    fontWeight: '600',
    padding: '1px 6px',
    borderRadius: '10px',
  },
  followerBadge: {
    background: '#DBEAFE',
    color: '#1D4ED8',
    fontSize: '0.7rem',
    fontWeight: '600',
    padding: '1px 6px',
    borderRadius: '10px',
  },
  followBtn: {
    padding: '0.4rem 1rem',
    background: '#1a73e8',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontWeight: '600',
    fontSize: '0.85rem',
    cursor: 'pointer',
    flexShrink: 0,
  },
  followingBtn: {
    padding: '0.4rem 1rem',
    background: '#F3F4F6',
    color: '#374151',
    border: '1px solid #D1D5DB',
    borderRadius: '8px',
    fontWeight: '600',
    fontSize: '0.85rem',
    cursor: 'pointer',
    flexShrink: 0,
  },
  // Friend reading card
  friendCard: {
    border: '1px solid #F3F4F6',
    borderRadius: '10px',
    padding: '1rem',
    marginBottom: '0.75rem',
  },
  friendCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.75rem',
  },
  friendAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontWeight: '700',
    fontSize: '0.875rem',
    flexShrink: 0,
  },
  friendNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    flexWrap: 'wrap',
  },
  friendName: {
    fontWeight: '700',
    color: '#1a202c',
    fontSize: '0.95rem',
  },
  readingCount: {
    color: '#059669',
    fontSize: '0.8rem',
    fontWeight: '500',
  },
  booksRow: {
    display: 'flex',
    gap: '0.75rem',
    overflowX: 'auto',
    paddingBottom: '0.25rem',
  },
  bookCard: {
    display: 'flex',
    flexDirection: 'column',
    width: '90px',
    flexShrink: 0,
  },
  bookCover: {
    width: '90px',
    height: '130px',
    objectFit: 'cover',
    borderRadius: '6px',
    marginBottom: '0.375rem',
    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
  },
  bookCoverFallback: {
    width: '90px',
    height: '130px',
    background: '#F3F4F6',
    borderRadius: '6px',
    marginBottom: '0.375rem',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2rem',
  },
  bookTitle: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#1a202c',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    lineHeight: '1.2',
  },
  bookAuthor: {
    fontSize: '0.7rem',
    color: '#6B7280',
    marginTop: '2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
};
