import { useState, useEffect } from 'react';
import { apiFetch } from '../../services/api';

const EMOTIONS = [
  { label: 'Calm', emoji: '😌', color: '#E0F2FE', textColor: '#0284C7' },
  { label: 'Hope', emoji: '🌱', color: '#DCFCE7', textColor: '#16A34A' },
  { label: 'Joy', emoji: '😊', color: '#FEF9C3', textColor: '#CA8A04' },
  { label: 'Sadness', emoji: '😢', color: '#DBEAFE', textColor: '#1D4ED8' },
  { label: 'Anger', emoji: '😠', color: '#FEE2E2', textColor: '#DC2626' },
  { label: 'Fear', emoji: '😨', color: '#F3E8FF', textColor: '#9333EA' },
  { label: 'Surprise', emoji: '😲', color: '#FFEDD5', textColor: '#EA580C' },
  { label: 'Love', emoji: '❤️', color: '#FCE7F3', textColor: '#DB2777' },
  { label: 'Curiosity', emoji: '🤔', color: '#E0E7FF', textColor: '#4F46E5' },
  { label: 'Inspiration', emoji: '✨', color: '#FEF3C7', textColor: '#D97706' },
];

export default function BookDetailModal({ book, onClose, onUpdate, onAddNote }) {
  const [activeTab, setActiveTab] = useState('progress');
  const [currentPage, setCurrentPage] = useState(book?.current_page || 0);
  const [noteText, setNoteText] = useState('');
  const [notePage, setNotePage] = useState('');
  const [noteChapter, setNoteChapter] = useState('');
  const [selectedEmotion, setSelectedEmotion] = useState(null);
  const [notes, setNotes] = useState([]);
  const [bookFormat, setBookFormat] = useState(book?.format || 'hardcover');
  const [ownershipStatus, setOwnershipStatus] = useState(book?.ownership_status || 'owned');
  const [borrowedFrom, setBorrowedFrom] = useState(book?.borrowed_from || '');
  const [loanedTo, setLoanedTo] = useState(book?.loaned_to || '');

  useEffect(() => {
    if (!book) return;
    
    const fetchNotes = async () => {
      try {
        const data = await apiFetch(`/notes/userbook/${book.id}`);
        setNotes(data);
      } catch (error) {
        console.error('Error fetching notes:', error);
      }
    };

    fetchNotes();
  }, [book]);

  // Show 100% if status is 'finished', otherwise calculate progress
  const completionPercentage = book.status === 'finished'
    ? 100
    : (book.total_pages ? Math.round((currentPage / book.total_pages) * 100) : 0);

  const handleUpdateProgress = async () => {
    try {
      // Update progress
      await apiFetch(`/userbooks/${book.id}/progress`, {
        method: 'PUT',
        body: JSON.stringify({ current_page: currentPage }),
      });

      // Update format and ownership
      await apiFetch(`/userbooks/${book.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          format: bookFormat,
          ownership_status: ownershipStatus,
          borrowed_from: ownershipStatus === 'borrowed' ? borrowedFrom : null,
          loaned_to: ownershipStatus === 'loaned' ? loanedTo : null,
        }),
      });

      if (onUpdate) {
        onUpdate();
      }

      alert('Progress and book details updated successfully!');
    } catch (error) {
      console.error('Error updating progress:', error);
      alert('Failed to update progress. Please try again.');
    }
  };

  const handleMarkAsFinished = async () => {
    try {
      await apiFetch(`/userbooks/${book.id}/finish`, {
        method: 'POST',
      });

      if (onUpdate) {
        onUpdate();
      }

      alert('Book marked as finished!');
      onClose();
    } catch (error) {
      console.error('Error marking as finished:', error);
      alert('Failed to mark as finished. Please try again.');
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) {
      alert('Please write a note before adding.');
      return;
    }

    try {
      const payload = {
        userbook_id: book.id,
        text: noteText,
        page_number: notePage ? parseInt(notePage) : null,
        chapter: noteChapter || null,
        emotion: selectedEmotion?.label || null,
      };

      const newNote = {
        id: Date.now(),
        ...payload,
        created_at: new Date().toISOString(),
      };

      await apiFetch('/notes/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (onAddNote) {
        onAddNote(book.id, newNote);
      }

      setNotes([newNote, ...notes]);

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

  if (!book) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Close Button - Top Right */}
        <button onClick={onClose} className="modal-close-btn">
          ×
        </button>

        {/* Header */}
        <div className="book-detail-header">
          {/* Book Cover */}
          <div style={{ flexShrink: 0 }}>
            {book.cover_url ? (
              <img
                src={book.cover_url}
                alt={book.title}
                className="book-cover-detail"
                style={{ width: '120px', height: 'auto', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
              />
            ) : (
              <div className="book-cover-placeholder" style={{ width: '120px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5E7EB', borderRadius: '8px', fontSize: '3rem' }}>
                📖
              </div>
            )}
          </div>

          {/* Book Info */}
          <div className="book-info">
            <h2 className="book-info-title">
              {book.title}
            </h2>
            <p className="book-info-author">
              {book.author}
            </p>
            <div className="book-meta">
              {book.total_pages && <span>📄 {book.total_pages} pages</span>}
              {book.publisher && <span>📚 {book.publisher}</span>}
            </div>
            
            {/* Progress Circle */}
            <div className="progress-circle-large">
              <span>
                {completionPercentage}%
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs-nav">
          <button
            onClick={() => setActiveTab('progress')}
            className={`tab-nav-button ${activeTab === 'progress' ? 'active' : ''}`}
          >
            Update Progress
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`tab-nav-button ${activeTab === 'notes' ? 'active' : ''}`}
          >
            Notes & Journal ({notes.length})
          </button>
        </div>

        {/* Content */}
        <div className="tab-content">
          {/* Progress Tab */}
          {activeTab === 'progress' && (
            <div className="progress-section">
              <h3>Update Reading Progress</h3>
              
              <div className="progress-input-group">
                <label className="form-label">
                  Current Page
                </label>
                <input
                  type="number"
                  value={currentPage}
                  onChange={(e) => setCurrentPage(parseInt(e.target.value) || 0)}
                  min="0"
                  max={book.total_pages || 999999}
                  className="form-input"
                />
                {book.total_pages && (
                  <p className="form-hint">
                    of {book.total_pages} pages ({completionPercentage}% complete)
                  </p>
                )}
              </div>

              {/* Format and Ownership Section */}
              <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>
                  Book Details
                </h4>
                
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">Format</label>
                    <select 
                      value={bookFormat} 
                      onChange={(e) => setBookFormat(e.target.value)}
                      className="form-input"
                    >
                      <option value="hardcover">Hardcover</option>
                      <option value="paperback">Paperback</option>
                      <option value="ebook">eBook</option>
                      <option value="kindle">Kindle</option>
                      <option value="pdf">PDF</option>
                      <option value="audiobook">Audiobook</option>
                    </select>
                  </div>

                  <div style={{ flex: 1 }}>
                    <label className="form-label">Ownership</label>
                    <select 
                      value={ownershipStatus} 
                      onChange={(e) => {
                        setOwnershipStatus(e.target.value);
                        if (e.target.value !== 'borrowed') setBorrowedFrom('');
                        if (e.target.value !== 'loaned') setLoanedTo('');
                      }}
                      className="form-input"
                    >
                      <option value="owned">Owned / In Library</option>
                      <option value="borrowed">Borrowed</option>
                      <option value="loaned">Loaned</option>
                    </select>
                  </div>
                </div>

                {ownershipStatus === 'borrowed' && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label">Borrowed From</label>
                    <input
                      type="text"
                      placeholder="Enter person's name"
                      value={borrowedFrom}
                      onChange={(e) => setBorrowedFrom(e.target.value)}
                      className="form-input"
                    />
                  </div>
                )}

                {ownershipStatus === 'loaned' && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label">Loaned To</label>
                    <input
                      type="text"
                      placeholder="Enter person's name"
                      value={loanedTo}
                      onChange={(e) => setLoanedTo(e.target.value)}
                      className="form-input"
                    />
                  </div>
                )}
              </div>

              <div className="progress-buttons">
                <button
                  onClick={handleUpdateProgress}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  Save Progress
                </button>
                <button
                  onClick={handleMarkAsFinished}
                  className="btn btn-success"
                  style={{ flex: 1 }}
                >
                  Mark as Finished
                </button>
              </div>
            </div>
          )}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <div className="notes-section">
              {/* Add Note Form */}
              <div className="add-note-form">
                <h3>Add a New Note</h3>

                <div style={{ marginBottom: '1rem' }}>
                  <label className="form-label">
                    Your thoughts
                  </label>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="What are you thinking about this book?"
                    rows={3}
                    className="form-textarea"
                  />
                </div>

                <div className="form-grid">
                  <div>
                    <label className="form-label">
                      Page (optional)
                    </label>
                    <input
                      type="number"
                      value={notePage}
                      onChange={(e) => setNotePage(e.target.value)}
                      placeholder="e.g., 145"
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">
                      Chapter (optional)
                    </label>
                    <input
                      type="text"
                      value={noteChapter}
                      onChange={(e) => setNoteChapter(e.target.value)}
                      placeholder="e.g., Chapter 7"
                      className="form-input"
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label className="form-label">
                    How are you feeling? (optional)
                  </label>
                  <div className="emotion-selector">
                    {EMOTIONS.map((emotion) => (
                      <button
                        key={emotion.label}
                        onClick={() => setSelectedEmotion(selectedEmotion?.label === emotion.label ? null : emotion)}
                        className={`emotion-btn ${selectedEmotion?.label === emotion.label ? 'selected' : ''}`}
                        style={{
                          backgroundColor: emotion.color,
                          color: emotion.textColor,
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
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                >
                  Add Note
                </button>
              </div>

              {/* Notes Timeline */}
              <div>
                <h3>Your Notes</h3>
                
                {notes.length === 0 ? (
                  <p className="empty-state">
                    No notes yet. Add your first note above!
                  </p>
                ) : (
                  <div className="notes-list">
                    {notes.map((note, idx) => {
                      const emotionDisplay = note.emotion ? getEmotionDisplay(note.emotion) : null;
                      
                      return (
                        <div key={note.id || idx} className="note-card">
                          <div className="note-card-header">
                            <div className="note-card-meta">
                              {emotionDisplay && (
                                <span
                                  className="note-card-emotion"
                                  style={{
                                    backgroundColor: emotionDisplay.color,
                                    color: emotionDisplay.textColor,
                                  }}
                                >
                                  {emotionDisplay.emoji} {emotionDisplay.label}
                                </span>
                              )}
                              {note.page_number && (
                                <span className="note-card-location">
                                  Page {note.page_number}
                                </span>
                              )}
                              {note.chapter && (
                                <span className="note-card-location">
                                  • {note.chapter}
                                </span>
                              )}
                            </div>
                            <span className="note-card-date">
                              {formatDate(note.created_at)}
                            </span>
                          </div>
                          <p className="note-card-text">
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
