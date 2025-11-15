// BookCard - Individual book card in library
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../services/api';

const EMOTION_COLORS = {
  'Calm': { emoji: '😌', bg: '#E0F2FE', text: '#0C4A6E' },
  'Hope': { emoji: '🌱', bg: '#DCFCE7', text: '#16A34A' },
  'Joy': { emoji: '😊', bg: '#FEF3C7', text: '#CA8A04' },
  'Sadness': { emoji: '😢', bg: '#DBEAFE', text: '#1D4ED8' },
  'Anger': { emoji: '😠', bg: '#FEE2E2', text: '#DC2626' },
  'Fear': { emoji: '�', bg: '#F3E8FF', text: '#9333EA' },
  'Surprise': { emoji: '😲', bg: '#FFEDD5', text: '#EA580C' },
  'Love': { emoji: '❤️', bg: '#FCE7F3', text: '#DB2777' },
  'Curiosity': { emoji: '🤔', bg: '#E0E7FF', text: '#4F46E5' },
  'Inspiration': { emoji: '✨', bg: '#FEF3C7', text: '#D97706' },
};

export default function BookCard({ userbook, onOpenDetail, onQuickAddNote, onDelete }) {
  const book = userbook.book || {};
  const totalPages = book.total_pages || 0;
  const currentPage = userbook.current_page || 0;
  // Show 100% if status is 'finished', otherwise calculate progress
  const progress = userbook.status === 'finished' 
    ? 100 
    : (totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0);
  const [topEmotions, setTopEmotions] = useState([]);
  const [notesCount, setNotesCount] = useState(0);

  // Fetch top emotions from notes
  useEffect(() => {
    const fetchTopEmotions = async () => {
      try {
        const notes = await apiFetch(`/notes/userbook/${userbook.id}`);
        if (notes && notes.length > 0) {
          // Store notes count
          setNotesCount(notes.length);
          
          // Count emotions
          const emotionCounts = {};
          notes.forEach(note => {
            if (note.emotion) {
              emotionCounts[note.emotion] = (emotionCounts[note.emotion] || 0) + 1;
            }
          });
          
          // Sort by count and get top 3
          const sorted = Object.entries(emotionCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([emotion]) => emotion);
          
          setTopEmotions(sorted);
        }
      } catch (error) {
        console.error('Error fetching emotions:', error);
      }
    };

    fetchTopEmotions();
  }, [userbook.id]);

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

  const handleRemoveBook = async (e) => {
    e.stopPropagation(); // Prevent card click
    
    const confirmDelete = window.confirm(
      `Are you sure you want to remove "${book.title}" from your library? This action cannot be undone.`
    );
    
    if (!confirmDelete) return;
    
    try {
      await apiFetch(`/userbooks/${userbook.id}`, {
        method: 'DELETE',
      });
      
      if (onDelete) {
        onDelete(userbook.id);
      }
      
      alert('Book removed from library successfully!');
    } catch (error) {
      console.error('Error removing book:', error);
      alert('Failed to remove book. Please try again.');
    }
  };

  const getProgressClass = () => {
    if (progress >= 75) return 'high';
    if (progress >= 25) return 'medium';
    return 'low';
  };

  return (
    <div className="book-card" onClick={handleCardClick}>
      {/* Emotion Badges - Top Right - Only show if there are emotions */}
      {topEmotions.length > 0 && (
        <div className="emotion-badges">
          {topEmotions.map((emotion, idx) => {
            const emotionData = EMOTION_COLORS[emotion];
            return (
              <span
                key={idx}
                className="emotion-badge"
                style={{ backgroundColor: emotionData?.bg || '#E5E7EB' }}
                title={emotion}
              >
                {emotionData?.emoji || '📝'}
              </span>
            );
          })}
        </div>
      )}

      <div className="book-card-content">
        {/* Book Cover */}
        <div className="book-cover-wrapper">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt={book.title}
              className="book-cover-img"
            />
          ) : (
            <div className="book-cover-placeholder">
              <span className="book-cover-icon">📖</span>
            </div>
          )}
        </div>

        {/* Book Details */}
        <div className="book-details">
          {/* Title and Author */}
          <div className="book-header">
            <h3 className="book-title">{book.title}</h3>
          </div>
          <div className="book-author">
            <h3 className="book-author">{book.author}</h3>
          </div>
          
          {/* Book Info Footer */}
          {totalPages > 0 && (
          <div className="book-footer">
              <span>{currentPage} of {totalPages} pages</span>
            </div>
          )}

          {/* Progress Circle */}
          <div className={`progress-circle ${getProgressClass()}`}>
            {progress}%
          </div>
        </div>
      </div>

      {/* Quick Actions - Outside book-details for left alignment */}
      <div className="quick-actions">
        <button
          onClick={handleQuickUpdateProgress}
          className="quick-action-btn blue"
        >
          📊 Update
        </button>
        <button
          onClick={handleQuickAddNote}
          className="quick-action-btn purple"
        >
          📝 Note {notesCount > 0 && <span className="note-badge">{notesCount}</span>}
        </button>
        <button
          onClick={handleRemoveBook}
          className="quick-action-btn red"
          title="Remove book from library"
        >
          🗑️ Remove
        </button>
      </div>
    </div>
  );
}
