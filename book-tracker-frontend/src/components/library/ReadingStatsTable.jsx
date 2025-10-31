// ReadingStatsTable - Display user's reading statistics
import React, { useEffect, useState } from 'react';

export default function ReadingStatsTable({ library }) {
  const [stats, setStats] = useState({
    booksThisYear: 0,
    currentlyReading: 0,
    emotionsLogged: 0,
    pagesRead: 0,
    booksFinished: 0,
  });

  useEffect(() => {
    if (!library || !Array.isArray(library)) return;

    const currentYear = new Date().getFullYear();
    const booksThisYear = library.filter((ub) => {
      const createdYear = new Date(ub.created_at).getFullYear();
      return createdYear === currentYear;
    }).length;

    const currentlyReading = library.filter((ub) => ub.status === 'reading').length;
    const booksFinished = library.filter((ub) => ub.status === 'finished').length;
    
    const pagesRead = library.reduce((sum, ub) => sum + (ub.current_page || 0), 0);

    // Mock emotions count for now - will integrate with notes API later
    const emotionsLogged = Math.floor(Math.random() * 200); // Placeholder

    setStats({
      booksThisYear,
      currentlyReading,
      emotionsLogged,
      pagesRead,
      booksFinished,
    });
  }, [library]);

  const statItems = [
    { label: 'Books This Year', value: stats.booksThisYear, icon: '📚' },
    { label: 'Currently Reading', value: stats.currentlyReading, icon: '📖' },
    { label: 'Books Finished', value: stats.booksFinished, icon: '✅' },
    { label: 'Pages Read', value: stats.pagesRead.toLocaleString(), icon: '📄' },
    { label: 'Emotions Logged', value: stats.emotionsLogged, icon: '💭' },
  ];

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Reading Stats</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {statItems.map((item, idx) => (
          <div
            key={idx}
            className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-4 text-center hover:shadow-md transition-shadow"
          >
            <div className="text-3xl mb-2">{item.icon}</div>
            <div className="text-2xl font-bold text-gray-800 mb-1">{item.value}</div>
            <div className="text-xs text-gray-600 uppercase tracking-wide">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Additional insights */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center justify-between bg-gray-50 rounded p-3">
            <span className="text-gray-600">Avg. Pages/Book</span>
            <span className="font-semibold text-gray-800">
              {stats.booksFinished > 0
                ? Math.round(stats.pagesRead / stats.booksFinished)
                : 0}
            </span>
          </div>
          <div className="flex items-center justify-between bg-gray-50 rounded p-3">
            <span className="text-gray-600">Reading Streak</span>
            <span className="font-semibold text-gray-800">7 days 🔥</span>
          </div>
        </div>
      </div>
    </div>
  );
}
