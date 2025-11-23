// HomePage - Community Pulse page with post composer and feed
import React, { useState } from 'react';
import PostComposer from '../components/home/PostComposer';
import CommunityPulseFeed from '../components/home/CommunityPulseFeed';
import HomeSidebar from '../components/home/HomeSidebar';

export default function HomePage({ user }) {
  const [refreshKey, setRefreshKey] = useState(0);

  const handlePostCreated = () => {
    // Trigger feed refresh
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="page-container">
      <div className="content-wrapper">
        <div className="content-grid">
          {/* Main Content - Left/Center */}
          <div>
            {/* Post Composer - Only show if logged in */}
            {user ? (
              <PostComposer user={user} onPostCreated={handlePostCreated} />
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
                <h3 style={{ color: '#6366F1', marginBottom: '0.5rem' }}>Welcome to Track My Read!</h3>
                <p style={{ color: '#6B7280', marginBottom: '1rem' }}>
                  Join our community to share your reading journey, connect with fellow readers, and track your books.
                </p>
                <a 
                  href="/login" 
                  style={{ 
                    display: 'inline-block',
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#6366F1',
                    color: 'white',
                    borderRadius: '0.5rem',
                    textDecoration: 'none',
                    fontWeight: '500'
                  }}
                >
                  Login or Sign Up to Post
                </a>
              </div>
            )}
            
            {/* Community Feed */}
            <CommunityPulseFeed key={refreshKey} />
          </div>

          {/* Sidebar - Right */}
          <div>
            <HomeSidebar />
          </div>
        </div>
      </div>
    </div>
  );
}
