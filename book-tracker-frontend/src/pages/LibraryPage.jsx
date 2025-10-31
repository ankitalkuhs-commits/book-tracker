// LibraryPage - User's personal library with tabs, stats, and weekly pulse
import React, { useEffect, useState } from 'react';
import BookCard from '../components/library/BookCard';
import WeeklyPulseChart from '../components/library/WeeklyPulseChart';
import ReadingStatsTable from '../components/library/ReadingStatsTable';
import AddBookModal from '../components/library/AddBookModal';
import BookDetailModal from '../components/library/BookDetailModal';
import { apiFetch } from '../services/api';

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState('reading');
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddBookModal, setShowAddBookModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);

  const tabs = [
    { id: 'reading', label: 'Currently Reading', status: 'currently-reading' },
    { id: 'to-read', label: 'Want to Read', status: 'to-be-read' },
    { id: 'finished', label: 'Finished', status: 'finished' },
  ];

  // Load user's library
  const loadLibrary = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('bt_token');
      if (!token) {
        alert('Please login to view your library');
        return;
      }

      const data = await apiFetch('/userbooks/');
      setLibrary(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading library:', error);
      if (error.message.includes('401')) {
        alert('Session expired. Please login again.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  // Filter books by active tab
  const filteredBooks = library.filter((ub) => ub.status === tabs.find((t) => t.id === activeTab)?.status);

  // Handle book added from AddBookModal
  const handleBookAdded = async (bookData) => {
    console.log('Book added:', bookData);
    // Reload library to show the new book
    await loadLibrary();
  };

  // Handle opening book detail modal
  const handleOpenDetail = (userbook, defaultTab = 'progress') => {
    setSelectedBook(userbook);
    setShowDetailModal(true);
  };

  // Handle quick add note
  const handleQuickAddNote = (userbook) => {
    setSelectedBook(userbook);
    setShowDetailModal(true);
    // TODO: Set default tab to 'notes'
  };

  // Handle update progress
  const handleUpdateProgress = async (userbookId, currentPage, percentage) => {
    try {
      const token = localStorage.getItem('bt_token');
      if (!token) {
        alert('Please login');
        return;
      }

      const updatedUserbook = await apiFetch(`/userbooks/${userbookId}/progress`, {
        method: 'PUT',
        body: JSON.stringify({ current_page: currentPage }),
      });
      
      // Update local state
      setLibrary(library.map(ub => 
        ub.id === userbookId ? { ...ub, ...updatedUserbook } : ub
      ));
      
      setShowDetailModal(false);
      alert('Progress updated successfully!');
    } catch (error) {
      console.error('Error updating progress:', error);
      alert('Failed to update progress. Please try again.');
    }
  };

  // Handle add note
  const handleAddNote = (bookId, note) => {
    console.log('Adding note:', bookId, note);
    // TODO: Call API to add note
    alert('Note added successfully!');
  };

  // Handle mark as finished
  const handleMarkFinished = async (userbookId) => {
    try {
      const token = localStorage.getItem('bt_token');
      if (!token) {
        alert('Please login');
        return;
      }

      const data = await apiFetch(`/userbooks/${userbookId}/finish`, {
        method: 'POST',
      });
      
      const updatedUserbook = data.userbook;
      
      // Update local state
      setLibrary(library.map(ub => 
        ub.id === userbookId ? { ...ub, ...updatedUserbook } : ub
      ));
      
      setShowDetailModal(false);
      alert('Book marked as finished!');
    } catch (error) {
      console.error('Error marking as finished:', error);
      alert('Failed to mark as finished. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">My Library</h1>
            <p className="text-gray-600">Track your reading journey and emotional connections</p>
          </div>
          <button
            onClick={() => setShowAddBookModal(true)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3B82F6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#2563EB';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#3B82F6';
            }}
          >
            + Add Book
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="flex border-b border-gray-200">
            {tabs.map((tab) => {
              const count = library.filter((ub) => ub.status === tab.status).length;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                    activeTab === tab.id
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  {tab.label}
                  <span className="ml-2 px-2 py-1 bg-gray-100 rounded-full text-xs">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Books List */}
          <div className="p-6">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                <p className="mt-4 text-gray-600">Loading your library...</p>
              </div>
            ) : filteredBooks.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📚</div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  No books in this category
                </h3>
                <p className="text-gray-500 mb-4">
                  {activeTab === 'reading' && "Start reading a book to see it here"}
                  {activeTab === 'to-read' && "Add books you want to read"}
                  {activeTab === 'finished' && "Books you've completed will appear here"}
                </p>
                <button
                  onClick={() => setShowAddBookModal(true)}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#3B82F6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  + Add Your First Book
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBooks.map((userbook) => (
                  <BookCard 
                    key={userbook.id} 
                    userbook={userbook} 
                    onUpdate={loadLibrary}
                    onOpenDetail={handleOpenDetail}
                    onQuickAddNote={handleQuickAddNote}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Weekly Pulse Chart */}
          <WeeklyPulseChart />

          {/* Reading Stats */}
          <ReadingStatsTable library={library} />
        </div>
      </div>

      {/* Modals */}
      <AddBookModal
        isOpen={showAddBookModal}
        onClose={() => setShowAddBookModal(false)}
        onBookAdded={handleBookAdded}
      />

      <BookDetailModal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        book={selectedBook}
        onUpdateProgress={handleUpdateProgress}
        onAddNote={handleAddNote}
        onMarkFinished={handleMarkFinished}
      />
    </div>
  );
}
