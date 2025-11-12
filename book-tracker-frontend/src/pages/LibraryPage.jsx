// LibraryPage - User's personal library with tabs, stats, and weekly pulse
import React, { useEffect, useState } from 'react';
import BookCard from '../components/library/BookCard';
import WeeklyPulseChart from '../components/library/WeeklyPulseChart';
import ReadingStatsTable from '../components/library/ReadingStatsTable';
import AddBookModal from '../components/library/AddBookModal';
import BookDetailModal from '../components/library/BookDetailModal';
import { apiFetch } from '../services/api';

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddBookModal, setShowAddBookModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [formatFilter, setFormatFilter] = useState('all');
  const [ownershipFilter, setOwnershipFilter] = useState('all');

  const tabs = [
    { id: 'all', label: 'All', status: null },
    { id: 'reading', label: 'Currently Reading', status: 'reading' },
    { id: 'to-read', label: 'Want to Read', status: 'to-read' },
    { id: 'finished', label: 'Finished', status: 'finished' },
  ];

  // Load user's library
  const loadLibrary = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('bt_token');
      if (!token) {
        alert('Please login to view your library');
        setLoading(false);
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

  // Filter books by active tab, format, and ownership
  const filteredBooks = library.filter((ub) => {
    // Filter by status tab
    if (activeTab !== 'all') {
      const matchingTab = tabs.find((t) => t.id === activeTab);
      if (ub.status !== matchingTab?.status) return false;
    }
    
    // Filter by format
    if (formatFilter !== 'all' && ub.format !== formatFilter) return false;
    
    // Filter by ownership
    if (ownershipFilter !== 'all' && ub.ownership_status !== ownershipFilter) return false;
    
    return true;
  });

  // Handle book added from AddBookModal
  const handleBookAdded = async (bookData) => {
    console.log('Book added:', bookData);
    // Reload library to show the new book
    await loadLibrary();
  };

  // Handle opening book detail modal
  const handleOpenDetail = (userbook) => {
    setSelectedBook(userbook);
    setShowDetailModal(true);
  };

  // Handle quick add note
  const handleQuickAddNote = (userbook) => {
    setSelectedBook(userbook);
    setShowDetailModal(true);
  };

  // Handle add note
  const handleAddNote = (bookId, note) => {
    console.log('Adding note:', bookId, note);
    // Reload library after note is added to update any counts/stats
    loadLibrary();
  };

  return (
    <div className="page-container">
      <div className="content-wrapper">
        {/* Page Header */}
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="text-3xl font-bold text-gray-800">My Library</h1>
          <button
            onClick={() => setShowAddBookModal(true)}
            className="btn btn-primary"
          >
            + Add Book
          </button>
        </div>

        {/* Main Layout: Content + Sidebar */}
        <div className="content-grid">
          {/* Main Content Area */}
          <div>
            {/* Tabs */}
            <div className="tabs-container">
              <div className="tabs-header">
                {tabs.map((tab) => {
                  const count = tab.id === 'all' 
                    ? library.length 
                    : library.filter((ub) => ub.status === tab.status).length;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                    >
                      {tab.label}
                      <span className="tab-count">{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Filters */}
              <div style={{ 
                padding: '1rem 1.5rem', 
                borderBottom: '1px solid #E5E7EB',
                backgroundColor: '#F9FAFB',
                display: 'flex',
                gap: '1rem',
                alignItems: 'center',
                flexWrap: 'wrap'
              }}>
                <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#6B7280' }}>
                  Filter by:
                </span>
                
                <div style={{ display: 'flex', gap: '1rem', flex: 1, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: '150px' }}>
                    <select 
                      value={formatFilter} 
                      onChange={(e) => setFormatFilter(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #D1D5DB',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                    >
                      <option value="all">All Formats</option>
                      <option value="hardcover">Hardcover</option>
                      <option value="paperback">Paperback</option>
                      <option value="ebook">eBook</option>
                      <option value="kindle">Kindle</option>
                      <option value="pdf">PDF</option>
                      <option value="audiobook">Audiobook</option>
                    </select>
                  </div>

                  <div style={{ minWidth: '150px' }}>
                    <select 
                      value={ownershipFilter} 
                      onChange={(e) => setOwnershipFilter(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #D1D5DB',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                    >
                      <option value="all">All Ownership</option>
                      <option value="owned">Owned / In Library</option>
                      <option value="borrowed">Borrowed</option>
                      <option value="loaned">Loaned</option>
                    </select>
                  </div>

                  {(formatFilter !== 'all' || ownershipFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setFormatFilter('all');
                        setOwnershipFilter('all');
                      }}
                      style={{
                        padding: '0.5rem 1rem',
                        border: '1px solid #D1D5DB',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        backgroundColor: 'white',
                        color: '#6B7280',
                        cursor: 'pointer',
                        fontWeight: '500',
                      }}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>

              {/* Books List */}
              <div className="p-6">
                {loading ? (
                  <div className="loading">
                    <div className="spinner"></div>
                    <p className="loading-text">Loading your library...</p>
                  </div>
                ) : filteredBooks.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📚</div>
                    <h3 className="empty-title">No books in this category</h3>
                    <p className="empty-text">
                      {activeTab === 'all' && "Start building your library by adding books"}
                      {activeTab === 'reading' && "Start reading a book to see it here"}
                      {activeTab === 'to-read' && "Add books you want to read"}
                      {activeTab === 'finished' && "Books you've completed will appear here"}
                    </p>
                    <button
                      onClick={() => setShowAddBookModal(true)}
                      className="btn btn-primary"
                      style={{ marginTop: '1rem' }}
                    >
                      + Add Your First Book
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredBooks.map((userbook) => (
                      <BookCard 
                        key={userbook.id} 
                        userbook={userbook} 
                        onOpenDetail={handleOpenDetail}
                        onQuickAddNote={handleQuickAddNote}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div>
            {/* Weekly Pulse Chart */}
            <div className="sidebar-widget">
              <WeeklyPulseChart />
            </div>

            {/* Reading Stats */}
            <div className="sidebar-widget">
              <ReadingStatsTable library={library} />
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AddBookModal
        isOpen={showAddBookModal}
        onClose={() => setShowAddBookModal(false)}
        onBookAdded={handleBookAdded}
      />

      {showDetailModal && selectedBook && (
        <BookDetailModal
          book={selectedBook}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedBook(null);
          }}
          onUpdate={loadLibrary}
          onAddNote={handleAddNote}
        />
      )}
    </div>
  );
}
