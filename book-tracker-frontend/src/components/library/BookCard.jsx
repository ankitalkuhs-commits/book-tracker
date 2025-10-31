// BookCard - Individual book card in library
import React, { useState } from 'react';

const EMOTION_COLORS = {
  'Calm': { emoji: '😌', bg: '#E0F2FE', text: '#0C4A6E' },
  'Hope': { emoji: '💡', bg: '#FEF3C7', text: '#78350F' },
  'Joy': { emoji: '😊', bg: '#DCFCE7', text: '#14532D' },
  'Sadness': { emoji: '😢', bg: '#DDD6FE', text: '#4C1D95' },
  'Anger': { emoji: '😠', bg: '#FEE2E2', text: '#7F1D1D' },
  'Fear': { emoji: '😰', bg: '#F3E8FF', text: '#581C87' },
  'Excitement': { emoji: '🤩', bg: '#FFEDD5', text: '#7C2D12' },
  'Love': { emoji: '❤️', bg: '#FCE7F3', text: '#831843' },
  'Wonder': { emoji: '🌟', bg: '#E0E7FF', text: '#312E81' },
  'Reflection': { emoji: '🤔', bg: '#E5E7EB', text: '#1F2937' },
};

export default function BookCard({ userbook, onUpdate, onOpenDetail, onQuickAddNote }) {
  const book = userbook.book || {};
  const totalPages = book.total_pages || 0;
  const currentPage = userbook.current_page || 0;
  const progress = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

  // Mock emotion badges - will come from notes later
  const topEmotions = ['Joy', 'Hope', 'Wonder', 'Calm', 'Reflection', 'Love', 'Sadness', 'Excitement', 'Fear', 'Anger'];
  const displayEmotions = topEmotions.slice(0, 3); // Show top 3 emotions

  const handleCardClick = () => {
    if (onOpenDetail) {
      onOpenDetail(userbook);
    }
  };

  const handleQuickAddNote = (e) => {
    e.stopPropagation(); // Prevent card click
    if (onQuickAddNote) {
      onQuickAddNote(userbook);
    }
  };

  const handleQuickUpdateProgress = (e) => {
    e.stopPropagation(); // Prevent card click
    if (onOpenDetail) {
      onOpenDetail(userbook, 'progress'); // Open with progress tab active
    }
  };

  return (
    <div
      onClick={handleCardClick}
      style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '1rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Emotion Badges - Top Right */}
      {displayEmotions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '0.75rem',
          right: '0.75rem',
          display: 'flex',
          gap: '0.25rem',
          zIndex: 1,
        }}>
          {displayEmotions.map((emotion, idx) => {
            const emotionData = EMOTION_COLORS[emotion];
            return (
              <span
                key={idx}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: emotionData?.bg || '#E5E7EB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.875rem',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                }}
                title={emotion}
              >
                {emotionData?.emoji || '📝'}
              </span>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem' }}>
        {/* Book Cover */}
        <div style={{ flexShrink: 0 }}>
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt={book.title}
              style={{
                width: '100px',
                height: '150px',
                objectFit: 'cover',
                borderRadius: '6px',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              }}
            />
          ) : (
            <div
              style={{
                width: '100px',
                height: '150px',
                background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.5rem',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              }}
            >
              <span style={{
                fontSize: '2rem',
                color: 'white',
                textAlign: 'center',
              }}>
                📖
              </span>
            </div>
          )}
        </div>

        {/* Book Details */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Title and Author */}
          <div style={{ marginBottom: '0.75rem', paddingRight: '3rem' }}>
            <h3 style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: '#1F2937',
              marginBottom: '0.25rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {book.title}
            </h3>
            {book.author && (
              <p style={{
                fontSize: '0.875rem',
                color: '#6B7280',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {book.author}
              </p>
            )}
          </div>

          {/* Progress Circle */}
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              border: '4px solid #E5E7EB',
              borderTopColor: progress >= 75 ? '#10B981' : progress >= 25 ? '#3B82F6' : '#6B7280',
              borderRightColor: progress >= 75 ? '#10B981' : progress >= 25 ? '#3B82F6' : '#6B7280',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.875rem',
              fontWeight: '700',
              color: '#1F2937',
            }}>
              {progress}%
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{
            marginTop: 'auto',
            display: 'flex',
            gap: '0.5rem',
          }}>
            <button
              onClick={handleQuickUpdateProgress}
              style={{
                padding: '0.5rem 0.75rem',
                backgroundColor: '#EFF6FF',
                color: '#1E40AF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#DBEAFE';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#EFF6FF';
              }}
            >
              📊 Update
            </button>
            <button
              onClick={handleQuickAddNote}
              style={{
                padding: '0.5rem 0.75rem',
                backgroundColor: '#F3E8FF',
                color: '#6B21A8',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#E9D5FF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#F3E8FF';
              }}
            >
              📝 Note
            </button>
          </div>
        </div>
      </div>

      {/* Book Info Footer */}
      {totalPages > 0 && (
        <div style={{
          marginTop: '0.75rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid #F3F4F6',
          fontSize: '0.75rem',
          color: '#9CA3AF',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>{currentPage} of {totalPages} pages</span>
          <span>{totalPages - currentPage} pages left</span>
        </div>
      )}
    </div>
  );
}
