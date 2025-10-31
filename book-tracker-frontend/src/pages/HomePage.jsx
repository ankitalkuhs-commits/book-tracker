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
            {/* Post Composer */}
            <PostComposer user={user} onPostCreated={handlePostCreated} />
            
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
