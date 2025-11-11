// AddBookModal - Search and add books from Google Books API
import React, { useState } from 'react';
import { BACKEND, apiFetch } from '../../services/api';

export default function AddBookModal({ isOpen, onClose, onBookAdded }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedTab, setSelectedTab] = useState('to-read');
  const [bookFormat, setBookFormat] = useState('hardcover');
  const [ownershipStatus, setOwnershipStatus] = useState('owned');
  const [borrowedFrom, setBorrowedFrom] = useState('');
  const [loanedTo, setLoanedTo] = useState('');

  const handleSearch = async () => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      alert('Please enter at least 2 characters to search');
      return;
    }

    setIsSearching(true);
    try {
      const data = await apiFetch(
        `/api/googlebooks/search?query=${encodeURIComponent(searchQuery)}&max_results=10`
      );
      setSearchResults(data.results || []);
    } catch (error) {
      console.error('Error searching books:', error);
      alert('Failed to search books. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddBook = async (book) => {
    try {
      const token = localStorage.getItem('bt_token');
      if (!token) {
        alert('Please login to add books');
        return;
      }

      // Prepare payload matching backend AddBookFromGooglePayload
      const payload = {
        title: book.title,
        author: book.authors ? book.authors.join(', ') : null,
        isbn: book.isbn_13 || book.isbn_10 || null,
        cover_url: book.cover_url,
        total_pages: book.total_pages,
        description: book.description,
        publisher: book.publisher,
        published_date: book.published_date,
        status: selectedTab,
        current_page: 0,
        format: bookFormat,
        ownership_status: ownershipStatus,
        borrowed_from: ownershipStatus === 'borrowed' ? borrowedFrom : null,
        loaned_to: ownershipStatus === 'loaned' ? loanedTo : null,
      };

      const data = await apiFetch('/books/add-to-library', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Success!
      alert(`"${book.title}" has been added to your library!`);
      
      if (onBookAdded) {
        onBookAdded(data);
      }
      
      // Reset and close
      setSearchQuery('');
      setSearchResults([]);
      onClose();
    } catch (error) {
      console.error('Error adding book:', error);
      // Show the error message from backend (e.g., "Book already in library")
      alert(error.message || 'Failed to add book. Please try again.');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  if (!isOpen) return null;

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
          maxWidth: '800px',
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
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1F2937', margin: 0 }}>
            Add a Book
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6B7280',
              padding: '0.25rem',
            }}
          >
            ×
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <input
              type="text"
              placeholder="Search by title, author, or ISBN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
                border: '2px solid #E5E7EB',
                borderRadius: '8px',
                fontSize: '1rem',
                outline: 'none',
              }}
              autoFocus
            />
            <button
              onClick={handleSearch}
              disabled={isSearching}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#3B82F6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: isSearching ? 'not-allowed' : 'pointer',
                opacity: isSearching ? 0.6 : 1,
              }}
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Tab Selector */}
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#6B7280', marginRight: '0.5rem', lineHeight: '2rem' }}>
              Add to:
            </span>
            <button
              onClick={() => setSelectedTab('reading')}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer',
                backgroundColor: selectedTab === 'reading' ? '#3B82F6' : 'white',
                color: selectedTab === 'reading' ? 'white' : '#374151',
              }}
            >
              Currently Reading
            </button>
            <button
              onClick={() => setSelectedTab('to-read')}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer',
                backgroundColor: selectedTab === 'to-read' ? '#3B82F6' : 'white',
                color: selectedTab === 'to-read' ? 'white' : '#374151',
              }}
            >
              Want to Read
            </button>
            <button
              onClick={() => setSelectedTab('finished')}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #D1D5DB',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: 'pointer',
                backgroundColor: selectedTab === 'finished' ? '#3B82F6' : 'white',
                color: selectedTab === 'finished' ? 'white' : '#374151',
              }}
            >
              Finished
            </button>
          </div>

          {/* Format and Ownership Section */}
          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.375rem' }}>
                  Format
                </label>
                <select 
                  value={bookFormat} 
                  onChange={(e) => setBookFormat(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
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
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.375rem' }}>
                  Ownership
                </label>
                <select 
                  value={ownershipStatus} 
                  onChange={(e) => {
                    setOwnershipStatus(e.target.value);
                    setBorrowedFrom('');
                    setLoanedTo('');
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="owned">Owned / In Library</option>
                  <option value="borrowed">Borrowed</option>
                  <option value="loaned">Loaned</option>
                </select>
              </div>
            </div>

            {/* Conditional fields for borrowed/loaned */}
            {ownershipStatus === 'borrowed' && (
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.375rem' }}>
                  Borrowed From
                </label>
                <input
                  type="text"
                  placeholder="Enter person's name"
                  value={borrowedFrom}
                  onChange={(e) => setBorrowedFrom(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none',
                  }}
                />
              </div>
            )}

            {ownershipStatus === 'loaned' && (
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.375rem' }}>
                  Loaned To
                </label>
                <input
                  type="text"
                  placeholder="Enter person's name"
                  value={loanedTo}
                  onChange={(e) => setLoanedTo(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    outline: 'none',
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Search Results */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem',
        }}>
          {searchResults.length === 0 && !isSearching && (
            <div style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: '#9CA3AF',
            }}>
              <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>📚</p>
              <p>Search for books to add to your library</p>
            </div>
          )}

          {isSearching && (
            <div style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: '#9CA3AF',
            }}>
              <p>Searching...</p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {searchResults.map((book) => (
              <div
                key={book.google_id}
                style={{
                  display: 'flex',
                  gap: '1rem',
                  padding: '1rem',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.borderColor = '#3B82F6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = '#E5E7EB';
                }}
              >
                {/* Book Cover */}
                <div style={{ flexShrink: 0 }}>
                  {book.cover_url ? (
                    <img
                      src={book.cover_url}
                      alt={book.title}
                      style={{
                        width: '80px',
                        height: '120px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '80px',
                        height: '120px',
                        backgroundColor: '#E5E7EB',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '2rem',
                      }}
                    >
                      📖
                    </div>
                  )}
                </div>

                {/* Book Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
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
                  <p style={{
                    fontSize: '0.875rem',
                    color: '#6B7280',
                    marginBottom: '0.5rem',
                  }}>
                    {book.authors ? book.authors.join(', ') : 'Unknown Author'}
                  </p>
                  
                  {/* Rating and Pages */}
                  <div style={{
                    display: 'flex',
                    gap: '1rem',
                    fontSize: '0.75rem',
                    color: '#9CA3AF',
                    marginBottom: '0.5rem',
                  }}>
                    {book.average_rating && (
                      <span>⭐ {book.average_rating.toFixed(1)} ({book.ratings_count || 0} ratings)</span>
                    )}
                    {book.total_pages && (
                      <span>📄 {book.total_pages} pages</span>
                    )}
                  </div>

                  {/* Description */}
                  {book.description && (
                    <p style={{
                      fontSize: '0.75rem',
                      color: '#6B7280',
                      lineHeight: '1.4',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {book.description}
                    </p>
                  )}
                </div>

                {/* Add Button */}
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  <button
                    onClick={() => handleAddBook(book)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#10B981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#059669';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#10B981';
                    }}
                  >
                    + Add Book
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
