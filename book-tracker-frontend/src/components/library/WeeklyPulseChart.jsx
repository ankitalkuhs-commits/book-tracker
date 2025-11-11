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
    <>
      <h3 className="widget-title">Your Weekly Pulse</h3>
      
      <div className="chart-container">
        {weekData.map((data, idx) => {
          const height = (data.pages / maxPages) * 160; // 160px max height
          return (
            <div key={idx} className="chart-bar-wrapper">
              {/* Bar */}
              <div className="chart-bar-container">
                <div
                  className="chart-bar"
                  style={{ height: `${height}px` }}
                  title={`${data.pages} pages`}
                ></div>
              </div>
              
              {/* Label */}
              <div className="chart-label">
                <p className="chart-day">{data.day}</p>
                <p className="chart-value">{data.pages}p</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="chart-summary">
        Total this week:{' '}
        <span className="chart-summary-value">
          {weekData.reduce((sum, d) => sum + d.pages, 0)} pages
        </span>
      </div>
    </>
  );
}
