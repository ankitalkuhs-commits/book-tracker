// WeeklyPulseChart - Bar chart showing pages read per day
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';

export default function WeeklyPulseChart() {
  const [weekData, setWeekData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReadingActivity();
  }, []);

  const loadReadingActivity = async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/reading-activity/daily?days=30');
      
      // Get last 7 days for weekly view
      const last7Days = data.data.slice(-7);
      
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc
      
      // Map data to day names
      const chartData = last7Days.map((dayData, index) => {
        const dayIndex = (today - 6 + index) % 7;
        const adjustedIndex = dayIndex === 0 ? 6 : dayIndex - 1; // Adjust so Monday = 0
        
        return {
          day: days[adjustedIndex] || days[index],
          pages: dayData.pages_read || 0,
          date: dayData.date
        };
      });
      
      setWeekData(chartData);
    } catch (error) {
      console.error('Error loading reading activity:', error);
      // Fallback to empty data
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const emptyData = days.map((day) => ({ day, pages: 0 }));
      setWeekData(emptyData);
    } finally {
      setLoading(false);
    }
  };

  const maxPages = Math.max(...weekData.map((d) => d.pages), 1);

  if (loading) {
    return (
      <>
        <h3 className="widget-title">Your Weekly Reading</h3>
        <div className="chart-container" style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '200px' 
        }}>
          <p>Loading...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <h3 className="widget-title">Your Weekly Reading</h3>
      
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
