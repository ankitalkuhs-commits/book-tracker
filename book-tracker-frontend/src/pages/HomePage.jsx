// HomePage - Community Pulse page with post composer and feed
import React, { useState } from 'react';
import PostComposer from '../components/home/PostComposer';
import CommunityPulseFeed from '../components/home/CommunityPulseFeed';
import YourFriendsTab from '../components/home/YourFriendsTab';
import CurrentlyReadingWidget from '../components/home/CurrentlyReadingWidget';

export default function HomePage({ user, onRoute }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState('community');

  const handlePostCreated = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="page-container">
      <div className="content-wrapper">
        {/* Community / Your Friends tabs */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '1.25rem',
        }}>
          <div style={{
            display: 'flex',
            background: 'white',
            borderRadius: '30px',
            padding: '4px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            gap: '2px',
          }}>
            {[['community', '🌐 Community'], ['friends', '👥 Your Friends']].map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '0.5rem 1.4rem',
                  border: 'none',
                  borderRadius: '24px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s',
                  background: activeTab === tab
                    ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                    : 'transparent',
                  color: activeTab === tab ? 'white' : '#6B7280',
                  boxShadow: activeTab === tab ? '0 2px 8px rgba(102,126,234,0.4)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'community' ? (
          <div className="content-grid">
            {/* Main Content */}
            <div className="main-content">
              {user ? (
                <PostComposer user={user} onPostCreated={handlePostCreated} />
              ) : (
                <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
                  <h3 style={{ color: '#1a73e8', marginBottom: '0.5rem' }}>Welcome to Track My Read!</h3>
                  <p style={{ color: '#6B7280', marginBottom: '1rem' }}>
                    Join our community to share your reading journey, connect with fellow readers, and track your books.
                  </p>
                  <button
                    onClick={() => onRoute && onRoute('login')}
                    style={{
                      padding: '0.75rem 2rem',
                      backgroundColor: '#1a73e8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                      fontSize: '1rem'
                    }}
                  >
                    Get Started
                  </button>
                </div>
              )}
              <CommunityPulseFeed key={refreshKey} currentUser={user} />
            </div>
            {/* Sidebar */}
            <div className="sidebar-content">
              <CurrentlyReadingWidget user={user} onRoute={onRoute} />
            </div>
          </div>
        ) : (
          <YourFriendsTab currentUser={user} />
        )}
      </div>
    </div>
  );
}
