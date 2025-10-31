// BookDetailModal - View and update book details, progress, and notes
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../services/api';

const EMOTIONS = [
  { label: 'Calm', emoji: '😌', color: '#E0F2FE', textColor: '#0C4A6E' },
  { label: 'Hope', emoji: '💡', color: '#FEF3C7', textColor: '#78350F' },
  { label: 'Joy', emoji: '😊', color: '#DCFCE7', textColor: '#14532D' },
  { label: 'Sadness', emoji: '😢', color: '#DDD6FE', textColor: '#4C1D95' },
  { label: 'Anger', emoji: '😠', color: '#FEE2E2', textColor: '#7F1D1D' },
  { label: 'Fear', emoji: '😰', color: '#F3E8FF', textColor: '#581C87' },
  { label: 'Excitement', emoji: '🤩', color: '#FFEDD5', textColor: '#7C2D12' },
  { label: 'Love', emoji: '❤️', color: '#FCE7F3', textColor: '#831843' },
  { label: 'Wonder', emoji: '🌟', color: '#E0E7FF', textColor: '#312E81' },
  { label: 'Reflection', emoji: '🤔', color: '#E5E7EB', textColor: '#1F2937' },
];

export default function BookDetailModal({ isOpen, onClose, book, onUpdateProgress, onAddNote, onMarkFinished }) {
  const [activeTab, setActiveTab] = useState('progress');
  const [currentPage, setCurrentPage] = useState(book?.current_page || 0);
  const [noteText, setNoteText] = useState('');
  const [notePage, setNotePage] = useState('');
  const [noteChapter, setNoteChapter] = useState('');
  const [selectedEmotion, setSelectedEmotion] = useState(null);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    if (book) {
      setCurrentPage(book.current_page || 0);
      
      // Fetch notes for this book from API
      const fetchNotes = async () => {
        try {
          const notesData = await apiFetch(`/notes/userbook/${book.id}`);
          setNotes(notesData);
        } catch (error) {
          console.error('Error fetching notes:', error);
        }
      };

      fetchNotes();
    }
  }, [book]);

  if (!isOpen || !book) return null;

  const completionPercentage = book.total_pages
    ? Math.min(Math.round((currentPage / book.total_pages) * 100), 100)
    : 0;

  const handleUpdateProgress = () => {
    if (currentPage < 0) {
      alert('Pages cannot be negative');
      return;
    }
    if (book.total_pages && currentPage > book.total_pages) {
      alert(`Pages cannot exceed total pages (${book.total_pages})`);
      return;
    }

    const newPercentage = book.total_pages
      ? Math.min(Math.round((currentPage / book.total_pages) * 100), 100)
      : 0;

    if (onUpdateProgress) {
      onUpdateProgress(book.id, currentPage, newPercentage);
    }
  };

  const handleMarkAsFinished = () => {
    if (onMarkFinished) {
      onMarkFinished(book.id);
    }
    onClose();
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) {
      alert('Please enter a note');
      return;
    }

    try {
      const token = localStorage.getItem('bt_token');
      if (!token) {
        alert('Please login');
        return;
      }

      const payload = {
        text: noteText,
        emotion: selectedEmotion?.label || null,
        page_number: notePage ? parseInt(notePage) : null,
        chapter: noteChapter || null,
        userbook_id: book.id,
        is_public: false, // Notes from library are private by default
      };

      const newNote = await apiFetch('/notes/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Call parent callback if provided
      if (onAddNote) {
        onAddNote(book.id, newNote);
      }

      // Add to local notes list (prepend to show at top)
      setNotes([newNote, ...notes]);

      // Reset form
      setNoteText('');
      setNotePage('');
      setNoteChapter('');
      setSelectedEmotion(null);

      alert('Note added successfully!');
    } catch (error) {
      console.error('Error adding note:', error);
      alert('Failed to add note. Please try again.');
    }
  };

  const getEmotionDisplay = (emotionLabel) => {
    return EMOTIONS.find(e => e.label === emotionLabel) || null;
  };

  const formatDate = (date) => {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
           ' at ' +
           d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '900px',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          gap: '1rem',
        }}>
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
                }}
              />
            ) : (
              <div
                style={{
                  width: '100px',
                  height: '150px',
                  backgroundColor: '#E5E7EB',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '3rem',
                }}
              >
                📖
              </div>
            )}
          </div>

          {/* Book Info */}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1F2937', marginBottom: '0.5rem' }}>
              {book.title}
            </h2>
            <p style={{ fontSize: '1rem', color: '#6B7280', marginBottom: '0.75rem' }}>
              {book.author}
            </p>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: '#9CA3AF' }}>
              {book.total_pages && <span>📄 {book.total_pages} pages</span>}
              {book.publisher && <span>📚 {book.publisher}</span>}
            </div>
            
            {/* Progress Circle */}
            <div style={{ marginTop: '1rem' }}>
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                border: '6px solid #E5E7EB',
                borderTopColor: '#3B82F6',
                borderRightColor: '#3B82F6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
                fontWeight: '700',
                color: '#1F2937',
                transform: `rotate(${completionPercentage * 3.6}deg)`,
                transition: 'transform 0.3s',
              }}>
                <span style={{ transform: `rotate(-${completionPercentage * 3.6}deg)` }}>
                  {completionPercentage}%
                </span>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6B7280',
              padding: '0.25rem',
              alignSelf: 'flex-start',
            }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #E5E7EB',
          padding: '0 1.5rem',
        }}>
          <button
            onClick={() => setActiveTab('progress')}
            style={{
              padding: '1rem 1.5rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: activeTab === 'progress' ? '#3B82F6' : '#6B7280',
              borderBottom: activeTab === 'progress' ? '2px solid #3B82F6' : '2px solid transparent',
            }}
          >
            Update Progress
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            style={{
              padding: '1rem 1.5rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: activeTab === 'notes' ? '#3B82F6' : '#6B7280',
              borderBottom: activeTab === 'notes' ? '2px solid #3B82F6' : '2px solid transparent',
            }}
          >
            Notes & Journal ({notes.length})
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem',
        }}>
          {/* Progress Tab */}
          {activeTab === 'progress' && (
            <div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#1F2937', marginBottom: '1rem' }}>
                Update Reading Progress
              </h3>
              
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                  Current Page
                </label>
                <input
                  type="number"
                  value={currentPage}
                  onChange={(e) => setCurrentPage(parseInt(e.target.value) || 0)}
                  min="0"
                  max={book.total_pages || 999999}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #E5E7EB',
                    borderRadius: '8px',
                    fontSize: '1rem',
                  }}
                />
                {book.total_pages && (
                  <p style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: '0.25rem' }}>
                    of {book.total_pages} pages ({completionPercentage}% complete)
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={handleUpdateProgress}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    backgroundColor: '#3B82F6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Save Progress
                </button>
                <button
                  onClick={handleMarkAsFinished}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    backgroundColor: '#10B981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Mark as Finished
                </button>
              </div>
            </div>
          )}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <div>
              {/* Add Note Form */}
              <div style={{
                backgroundColor: '#F9FAFB',
                padding: '1.5rem',
                borderRadius: '8px',
                marginBottom: '1.5rem',
              }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#1F2937', marginBottom: '1rem' }}>
                  Add a New Note
                </h3>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                    Your thoughts
                  </label>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="What are you thinking about this book?"
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #E5E7EB',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      resize: 'vertical',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                      Page (optional)
                    </label>
                    <input
                      type="number"
                      value={notePage}
                      onChange={(e) => setNotePage(e.target.value)}
                      placeholder="e.g., 145"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '2px solid #E5E7EB',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                      Chapter (optional)
                    </label>
                    <input
                      type="text"
                      value={noteChapter}
                      onChange={(e) => setNoteChapter(e.target.value)}
                      placeholder="e.g., Chapter 7"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '2px solid #E5E7EB',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                    How are you feeling? (optional)
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {EMOTIONS.map((emotion) => (
                      <button
                        key={emotion.label}
                        onClick={() => setSelectedEmotion(selectedEmotion?.label === emotion.label ? null : emotion)}
                        style={{
                          padding: '0.5rem 0.75rem',
                          border: selectedEmotion?.label === emotion.label ? '2px solid #3B82F6' : '2px solid transparent',
                          borderRadius: '20px',
                          backgroundColor: emotion.color,
                          color: emotion.textColor,
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        <span>{emotion.emoji}</span>
                        <span>{emotion.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleAddNote}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#3B82F6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Add Note
                </button>
              </div>

              {/* Notes Timeline */}
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#1F2937', marginBottom: '1rem' }}>
                  Your Notes
                </h3>
                
                {notes.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#9CA3AF', padding: '2rem' }}>
                    No notes yet. Add your first note above!
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {notes.map((note, idx) => {
                      const emotionDisplay = note.emotion ? getEmotionDisplay(note.emotion) : null;
                      
                      return (
                        <div
                          key={note.id || idx}
                          style={{
                            padding: '1rem',
                            border: '1px solid #E5E7EB',
                            borderRadius: '8px',
                            backgroundColor: 'white',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              {emotionDisplay && (
                                <span
                                  style={{
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '12px',
                                    backgroundColor: emotionDisplay.color,
                                    color: emotionDisplay.textColor,
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                  }}
                                >
                                  {emotionDisplay.emoji} {emotionDisplay.label}
                                </span>
                              )}
                              {note.page_number && (
                                <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                                  Page {note.page_number}
                                </span>
                              )}
                              {note.chapter && (
                                <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                                  • {note.chapter}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                              {formatDate(note.created_at)}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.875rem', color: '#1F2937', lineHeight: '1.5' }}>
                            {note.text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
