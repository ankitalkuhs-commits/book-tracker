// UserSearchModal - Search and follow users
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../services/api';

// UserCard component for displaying search results and following list
function UserCard({ user, showUnfollowButton = false, onFollowChange }) {
  const [isFollowing, setIsFollowing] = useState(user.is_following || false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Update local state when user prop changes
  useEffect(() => {
    setIsFollowing(user.is_following || false);
  }, [user.is_following]);

  const handleFollowToggle = async () => {
    setIsProcessing(true);
    try {
      if (isFollowing) {
        await apiFetch(`/follow/${user.id}`, { method: 'DELETE' });
        setIsFollowing(false);
        // Refresh the list after unfollow to remove from UI
        if (onFollowChange) {
          setTimeout(() => onFollowChange(), 100);
        }
      } else {
        const data = await apiFetch(`/follow/${user.id}`, { method: 'POST' });
        setIsFollowing(data.is_following);
        if (onFollowChange) onFollowChange();
      }
    } catch (error) {
      console.error('Follow action error:', error);
      alert('Failed to update follow status');
    } finally {
      setIsProcessing(false);
    }
  };

  const getInitials = () => {
    if (!user.name) return '?';
    return user.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getButtonText = () => {
    if (showUnfollowButton && isFollowing) return 'Unfollow';
    if (isFollowing) return 'Following';
    if (user.is_follower) return 'Follow Back';
    return 'Follow';
  };

  const getButtonStyle = () => {
    if (showUnfollowButton && isFollowing) return 'btn btn-danger btn-sm';
    if (isFollowing) return 'btn btn-secondary btn-sm';
    return 'btn btn-primary btn-sm';
  };

  return (
    <div className="user-card">
      <div className="user-card-avatar">{getInitials()}</div>
      <div className="user-card-info">
        <div className="user-card-name">{user.name}</div>
        <div className="user-card-username">@{user.username || `user${user.id}`}</div>
      </div>
      <div className="user-card-actions">
        {user.is_mutual && (
          <span className="badge badge-purple">
            Mutual
          </span>
        )}
        {user.is_follower && !user.is_mutual && (
          <span className="badge badge-primary">
            Follows you
          </span>
        )}
        <button
          onClick={handleFollowToggle}
          disabled={isProcessing}
          className={getButtonStyle()}
        >
          {isProcessing ? 'Loading...' : getButtonText()}
        </button>
      </div>
    </div>
  );
}

export default function UserSearchModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    if (activeTab === 'following') {
      loadFollowingList();
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const data = await apiFetch(`/users/search?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(data);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadFollowingList = async () => {
    try {
      const data = await apiFetch('/users/following');
      setFollowingList(data);
    } catch (error) {
      console.error('Error loading following list:', error);
    }
  };

  const handleFollowChange = () => {
    loadFollowingList();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Find Friends</h2>
          <button onClick={onClose} className="modal-close">×</button>
        </div>

        {/* Tabs */}
        <div className="tabs-header">
          <button
            onClick={() => setActiveTab('search')}
            className={`tab-button ${activeTab === 'search' ? 'active' : ''}`}
          >
            Search
          </button>
          <button
            onClick={() => setActiveTab('following')}
            className={`tab-button ${activeTab === 'following' ? 'active' : ''}`}
          >
            Following
            <span className="tab-count">{followingList.length}</span>
          </button>
        </div>

        {/* Content */}
        <div className="modal-body">
          {activeTab === 'search' && (
            <div>
              {/* Search Input */}
              <div className="form-group">
                <input
                  type="text"
                  placeholder="Search by name or username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input"
                  autoFocus
                />
              </div>

              {/* Search Results */}
              {isSearching && (
                <div className="text-center" style={{ padding: '2rem', color: '#9CA3AF' }}>
                  Searching...
                </div>
              )}

              {!isSearching && searchResults.length === 0 && searchQuery && (
                <div className="empty-state">
                  <div className="empty-icon">👥</div>
                  <div className="empty-title">No users found</div>
                  <div className="empty-text">Try searching with a different name</div>
                </div>
              )}

              {!isSearching && searchResults.length === 0 && !searchQuery && (
                <div className="empty-state">
                  <div className="empty-icon">🔍</div>
                  <div className="empty-title">Search for friends</div>
                  <div className="empty-text">Enter a name or username to find users</div>
                </div>
              )}

              <div className="result-list">
                {searchResults.map(user => (
                  <UserCard
                    key={user.id}
                    user={user}
                    showUnfollowButton={false}
                    onFollowChange={handleFollowChange}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'following' && (
            <div>
              {followingList.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">👥</div>
                  <div className="empty-title">Not following anyone yet</div>
                  <div className="empty-text">Use the search tab to find friends</div>
                </div>
              ) : (
                <div className="result-list">
                  {followingList.map(user => (
                    <UserCard
                      key={user.id}
                      user={user}
                      showUnfollowButton={true}
                      onFollowChange={handleFollowChange}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
