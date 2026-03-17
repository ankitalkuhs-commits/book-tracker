// HomeSidebar - Shows what friends are reading and community highlights
import React, { useEffect, useState } from 'react';
import UserSearchModal from './UserSearchModal';
import { apiFetch } from '../../services/api';

export default function HomeSidebar() {
  const [friendsReading, setFriendsReading] = useState([]);
  // const [topBooks, setTopBooks] = useState([]);
  // const [topReaders, setTopReaders] = useState([]);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Load friends feed from API
  useEffect(() => {
    loadFriendsFeed();
    // Keep mock data for community highlights (commented out for now)
    // setTopBooks([
    //   { title: 'The Song of Achilles', emoji: '😢', color: '#DDD6FE' },
    //   { title: 'Circe', emoji: '🌟', color: '#BBF7D0' },
    //   { title: 'Atomic Habits', emoji: '🌟', color: '#BBF7D0' },
    // ]);
    // setTopReaders([
    //   { username: '@marcoreads', initial: 'M' },
    //   { username: '@bookish_jane', initial: 'J' },
    // ]);
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

      {/* Community Highlights */
      {/* <div className="sidebar-widget">
        <h3 className="widget-title">Community Highlights</h3>

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
      </div> */}
    </div>
  );
}
