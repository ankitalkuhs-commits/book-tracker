// HomePage - Community Pulse page with post composer and feed
import React, { useState } from 'react';
import PostComposer from '../components/home/PostComposer';
import CommunityPulseFeed from '../components/home/CommunityPulseFeed';
import HomeSidebar from '../components/home/HomeSidebar';

export default function HomePage({ user, onRoute }) {
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
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button 
                    onClick={() => onRoute && onRoute('login')}
                    style={{ 
                      padding: '0.75rem 1.5rem',
                      backgroundColor: 'white',
                      color: '#6366F1',
                      border: '2px solid #6366F1',
                      borderRadius: '0.5rem',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    Login
                  </button>
                  <button 
                    onClick={() => onRoute && onRoute('signup')}
                    style={{ 
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#6366F1',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    Sign Up
                  </button>
                </div>
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
