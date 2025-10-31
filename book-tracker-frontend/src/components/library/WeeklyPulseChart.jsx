// WeeklyPulseChart - Bar chart showing pages read per day
import React, { useEffect, useState } from 'react';

export default function WeeklyPulseChart() {
  const [weekData, setWeekData] = useState([]);

  useEffect(() => {
    // Mock data for now - will integrate with backend tracking later
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const data = days.map((day) => ({
      day,
      pages: Math.floor(Math.random() * 50), // Random for demo
    }));
    setWeekData(data);
  }, []);

  const maxPages = Math.max(...weekData.map((d) => d.pages), 1);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Your Weekly Pulse</h3>
      
      <div className="flex items-end justify-between space-x-2 h-48">
        {weekData.map((data, idx) => {
          const height = (data.pages / maxPages) * 100;
          return (
            <div key={idx} className="flex-1 flex flex-col items-center">
              {/* Bar */}
              <div className="w-full flex flex-col justify-end h-40 mb-2">
                <div
                  className="w-full bg-gradient-to-t from-blue-500 to-purple-600 rounded-t transition-all hover:shadow-lg"
                  style={{ height: `${height}%`, minHeight: data.pages > 0 ? '8px' : '0' }}
                  title={`${data.pages} pages`}
                ></div>
              </div>
              
              {/* Label */}
              <div className="text-center">
                <p className="text-xs font-semibold text-gray-600">{data.day}</p>
                <p className="text-xs text-gray-400">{data.pages}p</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 border-t border-gray-200 text-center">
        <p className="text-sm text-gray-600">
          Total this week:{' '}
          <span className="font-bold text-blue-600">
            {weekData.reduce((sum, d) => sum + d.pages, 0)} pages
          </span>
        </p>
      </div>
    </div>
  );
}
