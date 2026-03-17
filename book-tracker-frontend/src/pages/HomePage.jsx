// HomePage - Community Pulse page with post composer and feed
import React, { useState } from 'react';
import PostComposer from '../components/home/PostComposer';
import CommunityPulseFeed from '../components/home/CommunityPulseFeed';
import YourFriendsTab from '../components/home/YourFriendsTab';
import HomeSidebar from '../components/home/HomeSidebar';

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
          borderBottom: '2px solid #E5E7EB',
          marginBottom: '1.25rem',
          background: 'white',
          borderRadius: '12px 12px 0 0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          {['community', 'friends'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '1rem',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.95rem',
                color: activeTab === tab ? '#1a73e8' : '#6B7280',
                borderBottom: activeTab === tab ? '2px solid #1a73e8' : '2px solid transparent',
                marginBottom: '-2px',
                transition: 'color 0.2s',
              }}
            >
              {tab === 'community' ? 'Community' : 'Your Friends'}
            </button>
          ))}
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
              <HomeSidebar />
            </div>
          </div>
        ) : (
          <YourFriendsTab currentUser={user} />
        )}
      </div>
    </div>
  );
}
