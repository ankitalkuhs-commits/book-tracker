// CurrentlyReadingWidget - Sidebar card showing what the logged-in user is currently reading
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';

export default function CurrentlyReadingWidget({ user, onRoute }) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    apiFetch('/userbooks/')
      .then(data => {
        const reading = (data || []).filter(ub => ub.status === 'reading').slice(0, 3);
        setBooks(reading);
      })
      .catch(() => setBooks([]))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      padding: '1.25rem',
      marginBottom: '1.5rem',
    }}>
      <h3 style={{
        fontSize: '0.95rem',
        fontWeight: '700',
        color: '#1a1a2e',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
      }}>
        📖 Currently Reading
      </h3>

      {loading ? (
        <div style={{ color: '#9CA3AF', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
          Loading...
        </div>
      ) : books.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '0.75rem 0' }}>
          <p style={{ color: '#9CA3AF', fontSize: '0.85rem' }}>
            No books in progress
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {books.map(ub => {
            const book = ub.book || {};
            const pct = book.total_pages && ub.current_page
              ? Math.min(100, Math.round((ub.current_page / book.total_pages) * 100))
              : null;
            return (
              <div key={ub.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                {/* Cover */}
                {book.cover_url ? (
                  <img
                    src={book.cover_url}
                    alt={book.title}
                    style={{ width: '40px', height: '58px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{
                    width: '40px', height: '58px', borderRadius: '4px', flexShrink: 0,
                    background: 'linear-gradient(135deg, #667eea, #764ba2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem',
                  }}>📚</div>
                )}
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: '600',
                    fontSize: '0.85rem',
                    color: '#1a1a2e',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {book.title || 'Unknown'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: '0.4rem' }}>
                    {book.author || ''}
                  </div>
                  {pct !== null && (
                    <div>
                      <div style={{
                        height: '5px', background: '#E5E7EB', borderRadius: '99px', overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: 'linear-gradient(90deg, #667eea, #764ba2)',
                          borderRadius: '99px',
                        }} />
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#9CA3AF', marginTop: '0.2rem' }}>
                        {pct}% · p.{ub.current_page} of {book.total_pages}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <button
            onClick={() => onRoute && onRoute('my-library')}
            style={{
              marginTop: '0.25rem',
              padding: '0.4rem',
              background: 'transparent',
              color: '#667eea',
              border: '1px solid #667eea',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Go to Library →
          </button>
        </div>
      )}
    </div>
  );
}
