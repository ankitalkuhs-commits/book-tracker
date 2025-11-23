// PulsePost - Individual post in the community feed
import React, { useState } from 'react';
import { BACKEND, apiFetch } from '../../services/api';

export default function PulsePost({ post, currentUser }) {
  const [likes, setLikes] = useState(post.likes_count || 0);
  const [liked, setLiked] = useState(post.user_has_liked || false);
  const [isLiking, setIsLiking] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(post.text || '');
  const [editedQuote, setEditedQuote] = useState(post.quote || '');
  const [isSaving, setIsSaving] = useState(false);
  
  // Check if current user owns this post
  const isOwner = currentUser && post.user && currentUser.id === post.user.id;

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

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      await apiFetch(`/notes/${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: editedText,
          quote: editedQuote,
          emotion: post.emotion,
          page_number: post.page_number,
          chapter: post.chapter,
          image_url: post.image_url,
          userbook_id: post.userbook?.id,
          is_public: post.is_public
        })
      });
      
      // Update post data
      post.text = editedText;
      post.quote = editedQuote;
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating post:', error);
      alert('Failed to update post');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedText(post.text || '');
    setEditedQuote(post.quote || '');
    setIsEditing(false);
  };

  return (
    <div className="card">
      <div className="feed-post">
        {/* User Avatar */}
        <div className="post-avatar">
          {getInitials(post.user?.name)}
        </div>

        <div className="post-content">
          {/* User header with edit button */}
          <div className="post-header">
            <div>
              <span className="post-username">{post.user?.name || 'Anonymous'}</span>
              <span className="post-meta"> shared this</span>
            </div>
            {isOwner && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '1rem',
                  color: '#6366F1',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer'
                }}
                title="Edit post"
              >
                ✏️
              </button>
            )}
          </div>

          {/* Book info */}
          {post.userbook?.book && (
            <div className="post-book-info">
              {post.userbook.book.title}
            </div>
          )}

          {/* Post text/quote - Edit mode or display mode */}
          {isEditing ? (
            <div style={{ marginBottom: '1rem' }}>
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                placeholder="What are you feeling from your read?"
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '0.75rem',
                  border: '1px solid #D1D5DB',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  marginBottom: '0.5rem'
                }}
              />
              {post.quote !== undefined && (
                <textarea
                  value={editedQuote}
                  onChange={(e) => setEditedQuote(e.target.value)}
                  placeholder="Add a quote (optional)"
                  style={{
                    width: '100%',
                    minHeight: '60px',
                    padding: '0.75rem',
                    border: '1px solid #D1D5DB',
                    borderRadius: '0.5rem',
                    fontSize: '0.95rem',
                    fontStyle: 'italic'
                  }}
                />
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#6366F1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: isSaving ? 'wait' : 'pointer',
                    opacity: isSaving ? 0.5 : 1
                  }}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#E5E7EB',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}

          {/* Image if available */}
          {post.image_url && (
            <div className="post-image">
              <img 
                src={post.image_url.startsWith('http') ? post.image_url : `${BACKEND}${post.image_url}`} 
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
