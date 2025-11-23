// HomeSidebar - Shows what friends are reading and community highlights
import React, { useEffect, useState } from 'react';
import UserSearchModal from './UserSearchModal';
import { apiFetch } from '../../services/api';

export default function HomeSidebar() {
  const [friendsReading, setFriendsReading] = useState([]);
  const [topBooks, setTopBooks] = useState([]);
  const [topReaders, setTopReaders] = useState([]);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Load friends feed from API
  useEffect(() => {
    loadFriendsFeed();
    // Keep mock data for community highlights
    setTopBooks([
      { title: 'The Song of Achilles', emoji: '😢', color: '#DDD6FE' },
      { title: 'Circe', emoji: '🌟', color: '#BBF7D0' },
      { title: 'Atomic Habits', emoji: '🌟', color: '#BBF7D0' },
    ]);
    setTopReaders([
      { username: '@marcoreads', initial: 'M' },
      { username: '@bookish_jane', initial: 'J' },
    ]);
  }, []);

  const loadFriendsFeed = async () => {
    try {
      const data = await apiFetch('/userbooks/friends/currently-reading?limit=5');
      // Transform API data to match component format
      const transformed = (data || []).map(item => {
        const name = item.user?.name || item.user?.username || 'Unknown';
        // Get initials (first letter of first and last name)
        const initials = name
          .split(' ')
          .map(n => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);
        
        return {
          user: name,
          book: item.book?.title || 'Unknown Book',
          author: item.book?.author || '',
          initial: initials,
          isMutual: item.user?.is_mutual || false
        };
      });
      setFriendsReading(transformed);
    } catch (error) {
      console.error('Error loading friends feed:', error);
      // Silently fail for unauthenticated users
      setFriendsReading([]);
    }
  };

  return (
    <div>
      {/* User Search Modal */}
      <UserSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
      />

      {/* What Friends Are Reading */}
      <div className="sidebar-widget">
        <div className="sidebar-header">
          <h3 className="widget-title">What Friends Are Reading</h3>
          <button onClick={() => setIsSearchModalOpen(true)} className="btn btn-primary">
            <span>👥</span>
            Find Friends
          </button>
        </div>
        
        {friendsReading.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No friends yet!</p>
            <p className="empty-state-subtitle">Search and follow readers to see what they're reading</p>
          </div>
        ) : (
          <div className="friend-list">
            {friendsReading.map((item, idx) => (
              <div key={idx} className="friend-item">
                <div className={`friend-avatar ${item.isMutual ? 'mutual' : ''}`}>
                  {item.initial}
                </div>
                
                <div className="friend-content">
                  <p className="friend-meta">
                    <span className="friend-name">{item.user}</span>
                    {item.isMutual && (
                      <span className="badge badge-purple">Mutual</span>
                    )}
                    {' '}is reading
                  </p>
                  <p className="friend-book">{item.book}</p>
                  {item.author && (
                    <p className="friend-author">{item.author}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Community Highlights */}
      <div className="sidebar-widget">
        <h3 className="widget-title">Community Highlights</h3>

        {/* Top Emotional Books */}
        <div className="highlight-section">
          <h4 className="highlight-header">
            <span className="highlight-icon">🏆</span>
            Top Emotional Books
          </h4>
          <div className="highlight-list">
            {topBooks.map((book, idx) => (
              <div key={idx} className="highlight-item">
                <div className="highlight-item-content">
                  <span className="highlight-rank">{idx + 1}.</span>
                  <span className="highlight-title">{book.title}</span>
                </div>
                <span className="highlight-emoji" style={{ backgroundColor: book.color }}>
                  {book.emoji}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Most Expressive Readers */}
        <div className="highlight-section section-gap">
          <h4 className="highlight-header">
            <span className="highlight-icon">✨</span>
            Most Expressive Readers
          </h4>
          <div className="highlight-list">
            {topReaders.map((reader, idx) => (
              <div key={idx} className="reader-item">
                <div className="reader-avatar">{reader.initial}</div>
                <span className="reader-username">{reader.username}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
