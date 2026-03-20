// ReadingStatsTable - Display user's reading statistics
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';

export default function ReadingStatsTable({ library, userStats }) {
  const [stats, setStats] = useState({
    booksThisYear: 0,
    currentlyReading: 0,
    emotionsLogged: 0,
    pagesRead: 0,
    booksFinished: 0,
  });

  useEffect(() => {
    // Skip until library has actually loaded (avoids double-fire with empty initial array)
    if (!library || !Array.isArray(library) || library.length === 0) return;

    const currentYear = new Date().getFullYear();
    const booksThisYear = library.filter((ub) => {
      const createdYear = new Date(ub.created_at).getFullYear();
      return createdYear === currentYear;
    }).length;

    const currentlyReading = library.filter((ub) => ub.status === 'reading').length;
    const booksFinished = library.filter((ub) => ub.status === 'finished').length;

    // Fetch pages read from backend (uses reading_activity or fallback calculation)
    const fetchStats = async () => {
      try {
        // Use pre-loaded userStats prop — avoids redundant /profile/me call
        const pagesRead = userStats?.total_pages_read ?? userStats?.totalPagesRead ?? 0;

        const notes = await apiFetch('/notes/me');
        const emotionsLogged = Array.isArray(notes) ? notes.length : 0;
        
        setStats({
          booksThisYear,
          currentlyReading,
          emotionsLogged,
          pagesRead,
          booksFinished,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
        // Fallback to client-side calculation if API fails
        const pagesRead = library.reduce((sum, ub) => {
          if (ub.status === 'finished') {
            return sum + (ub.book?.total_pages || ub.current_page || 0);
          } else if (ub.status === 'reading') {
            return sum + (ub.current_page || 0);
          }
          return sum;
        }, 0);
        
        setStats({
          booksThisYear,
          currentlyReading,
          emotionsLogged: 0,
          pagesRead,
          booksFinished,
        });
      }
    };

    fetchStats();
  }, [library, userStats]);

  const statItems = [
    { label: 'Books This Year', value: stats.booksThisYear, icon: '📚' },
    { label: 'Currently Reading', value: stats.currentlyReading, icon: '📖' },
    { label: 'Books Finished', value: stats.booksFinished, icon: '✅' },
    { label: 'Pages Read', value: stats.pagesRead.toLocaleString(), icon: '📄' },
    { label: 'Emotions Logged', value: stats.emotionsLogged, icon: '💭' },
  ];

  return (
    <>
      <h3 className="widget-title">Reading Stats</h3>
      
      <div className="stats-grid">
        {statItems.map((item, idx) => (
          <div key={idx} className="stat-card">
            <div className="stat-icon">{item.icon}</div>
            <div className="stat-value">{item.value}</div>
            <div className="stat-label">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Additional insights */}
      <div className="stats-insight">
        <div className="insight-grid">
          <div className="insight-item">
            <span className="insight-label">Avg. Pages/Book</span>
            <span className="insight-value">
              {stats.booksFinished > 0
                ? Math.round(stats.pagesRead / stats.booksFinished)
                : 0}
            </span>
          </div>
          <div className="insight-item">
            <span className="insight-label">Reading Streak</span>
            <span className="insight-value">7 days 🔥</span>
          </div>
        </div>
      </div>
    </>
  );
}
