// HomeSidebar - Shows what friends are reading and community highlights
import React, { useEffect, useState } from 'react';

export default function HomeSidebar() {
  const [friendsReading, setFriendsReading] = useState([]);
  const [topBooks, setTopBooks] = useState([]);
  const [topReaders, setTopReaders] = useState([]);

  // Mock data for now - will integrate with API later
  useEffect(() => {
    // Sample friends reading
    setFriendsReading([
      { user: 'Sarah', book: 'Project Hail Mary', author: 'Andy Weir', initial: 'S' },
      { user: 'Marcus', book: 'The Invisible Life of Addie LaRue', author: 'V.E. Schwab', initial: 'M' },
      { user: 'Emma', book: 'Tomorrow, and Tomorrow, and Tomorrow', author: 'Gabrielle Zevin', initial: 'E' },
    ]);

    // Sample top books with emotions and emojis
    setTopBooks([
      { title: 'The Song of Achilles', emoji: '😢', color: '#DDD6FE' },
      { title: 'Circe', emoji: '🌟', color: '#BBF7D0' },
      { title: 'Atomic Habits', emoji: '🌟', color: '#BBF7D0' },
    ]);

    // Sample top readers
    setTopReaders([
      { username: '@marcoreads', initial: 'M' },
      { username: '@bookish_jane', initial: 'J' },
    ]);
  }, []);

  return (
    <div>
      {/* What Friends Are Reading */}
      <div className="sidebar-widget">
        <h3 className="widget-title" style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1F2937' }}>
          What Friends Are Reading
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
          {friendsReading.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              {/* Avatar */}
              <div style={{
                width: '48px',
                height: '48px',
                backgroundColor: '#E5E7EB',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
                fontWeight: '600',
                color: '#4B5563',
                flexShrink: 0
              }}>
                {item.initial}
              </div>
              
              {/* Content */}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.875rem', color: '#4B5563', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: '600', color: '#1F2937' }}>{item.user}</span>
                  {' '}is reading
                </p>
                <p style={{ fontSize: '1rem', fontWeight: '600', color: '#1F2937', fontStyle: 'italic', marginBottom: '0.25rem' }}>
                  {item.book}
                </p>
                <p style={{ fontSize: '0.875rem', color: '#9CA3AF' }}>
                  {item.author}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Community Highlights */}
      <div className="sidebar-widget">
        <h3 className="widget-title" style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1F2937' }}>
          Community Highlights
        </h3>

        {/* Top Emotional Books */}
        <div style={{ marginTop: '1.5rem' }}>
          <h4 style={{ 
            fontSize: '0.875rem', 
            fontWeight: '600', 
            color: '#1F2937',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '1.25rem' }}>🏆</span>
            Top Emotional Books
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {topBooks.map((book, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  transition: 'background 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#6B7280', minWidth: '24px' }}>
                    {idx + 1}.
                  </span>
                  <span style={{ fontSize: '0.875rem', color: '#1F2937', fontStyle: 'italic' }}>
                    {book.title}
                  </span>
                </div>
                <span
                  style={{
                    padding: '0.375rem 0.75rem',
                    backgroundColor: book.color,
                    borderRadius: '16px',
                    fontSize: '1rem',
                    flexShrink: 0,
                    marginLeft: '0.5rem'
                  }}
                >
                  {book.emoji}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Most Expressive Readers */}
        <div style={{ marginTop: '2rem' }}>
          <h4 style={{ 
            fontSize: '0.875rem', 
            fontWeight: '600', 
            color: '#1F2937',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '1.25rem' }}>✨</span>
            Most Expressive Readers
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {topReaders.map((reader, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  transition: 'background 0.2s'
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: '40px',
                  height: '40px',
                  backgroundColor: '#E5E7EB',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: '#4B5563',
                  flexShrink: 0
                }}>
                  {reader.initial}
                </div>
                <span style={{ fontSize: '0.875rem', color: '#1F2937', fontWeight: '500' }}>
                  {reader.username}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
