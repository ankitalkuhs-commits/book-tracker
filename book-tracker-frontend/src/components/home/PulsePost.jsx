// PulsePost - Individual post in the community feed
import React, { useState } from 'react';
import { BACKEND, apiFetch } from '../../services/api';

export default function PulsePost({ post }) {
  const [likes, setLikes] = useState(post.likes_count || 0);
  const [comments] = useState(post.comments_count || 0);
  const [liked, setLiked] = useState(post.user_has_liked || false);
  const [isLiking, setIsLiking] = useState(false);

  // Format timestamp (e.g., "2 hours ago", "Oct 1, 2025")
  const formatTimestamp = (dateString) => {
    // Parse the UTC timestamp from backend
    const date = new Date(dateString);
    const now = new Date();
    
    // Calculate difference in milliseconds
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    
    // Otherwise show date in local timezone
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Get user initials
  const getInitials = (name) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Get emotion emoji and badge color
  const getEmotionDisplay = (emotion) => {
    const emotions = {
      Calm: { emoji: '😌', color: '#E0F2FE', textColor: '#0C4A6E' },
      Moved: { emoji: '😢', color: '#DBEAFE', textColor: '#1E3A8A' },
      Inspired: { emoji: '🌟', color: '#FEF3C7', textColor: '#78350F' },
      Happy: { emoji: '😊', color: '#DCFCE7', textColor: '#14532D' },
      Thoughtful: { emoji: '🤔', color: '#F3E8FF', textColor: '#581C87' },
      Surprised: { emoji: '😮', color: '#FFE4E6', textColor: '#881337' },
      Hope: { emoji: '💡', color: '#FEF3C7', textColor: '#78350F' },
    };
    return emotions[emotion] || { emoji: '📖', color: '#E5E7EB', textColor: '#374151' };
  };

  const emotionData = getEmotionDisplay(post.emotion);

  const handleLike = async () => {
    if (isLiking) return; // Prevent double-clicks
    
    setIsLiking(true);
    const previousLiked = liked;
    const previousLikes = likes;
    
    // Optimistic UI update
    setLiked(!liked);
    setLikes(liked ? likes - 1 : likes + 1);
    
    try {
      if (liked) {
        // Unlike
        await apiFetch(`/notes/${post.id}/like`, { method: 'DELETE' });
      } else {
        // Like
        await apiFetch(`/notes/${post.id}/like`, { method: 'POST' });
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      // Revert on error
      setLiked(previousLiked);
      setLikes(previousLikes);
    } finally {
      setIsLiking(false);
    }
  };

  return (
    <div className="card">
      <div className="feed-post">
        {/* User Avatar */}
        <div className="post-avatar">
          {getInitials(post.user?.name)}
        </div>

        <div className="post-content">
          {/* User header */}
          <div className="post-header">
            <span className="post-username">{post.user?.name || 'Anonymous'}</span>
            <span className="post-meta">felt</span>
            {post.emotion && (
              <span
                className="emotion-btn selected"
                style={{
                  backgroundColor: emotionData.color,
                  color: emotionData.textColor,
                }}
              >
                {emotionData.emoji} {post.emotion}
              </span>
            )}
            <span className="post-meta">reading</span>
          </div>

          {/* Book info */}
          {post.userbook?.book && (
            <div className="post-book-info">
              {post.userbook.book.title}
            </div>
          )}

          {/* Post text/quote */}
          {post.text && (
            <div className="post-text">
              {post.text}
            </div>
          )}

          {/* Quote section */}
          {post.quote && (
            <div className="post-quote">
              <span className="post-quote-icon">"</span>
              <p className="post-quote-text">
                {post.quote}
              </p>
              <span className="post-quote-icon" style={{ float: 'right' }}>"</span>
            </div>
          )}

          {/* Image if available */}
          {post.image_url && (
            <div className="post-image">
              <img 
                src={`${BACKEND}${post.image_url}`} 
                alt="Post"
              />
            </div>
          )}

          {/* Actions (likes, comments) */}
          <div className="post-actions">
            <button
              onClick={handleLike}
              disabled={isLiking}
              className="post-action-button"
              style={{
                color: liked ? '#EF4444' : '#6B7280',
                opacity: isLiking ? 0.5 : 1,
                cursor: isLiking ? 'wait' : 'pointer'
              }}
            >
              <span className="post-action-icon">{liked ? '❤️' : '🤍'}</span>
              <span>{likes}</span>
            </button>

            <button className="post-action-button">
              <span className="post-action-icon">💬</span>
              <span>{comments}</span>
            </button>
          </div>

          {/* Timestamp */}
          <div className="post-timestamp">
            {formatTimestamp(post.created_at)}
          </div>
        </div>
      </div>
    </div>
  );
}
