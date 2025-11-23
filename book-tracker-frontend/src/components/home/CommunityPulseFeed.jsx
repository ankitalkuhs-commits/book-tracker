// CommunityPulseFeed - Main feed showing all community posts
import React, { useEffect, useState } from 'react';
import PulsePost from './PulsePost';
import { apiFetch } from '../../services/api';

export default function CommunityPulseFeed({ currentUser }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load posts from API
  const loadPosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/notes/feed');
      console.log('Loaded posts from feed:', data);
      setPosts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading posts:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadPosts, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <p className="mt-4 text-gray-600">Loading community pulse...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="text-center py-8">
          <p className="text-red-600">Error loading feed: {error}</p>
          <button 
            onClick={loadPosts}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="empty-state card">
        <div className="empty-icon">📚</div>
        <h3 className="empty-title">No posts yet</h3>
        <p className="empty-text">Be the first to share your reading pulse!</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="section-title">Community Pulse</h2>
      <div>
        {posts.map((post) => (
          <PulsePost key={post.id} post={post} currentUser={currentUser} />
        ))}
      </div>
    </div>
  );
}
