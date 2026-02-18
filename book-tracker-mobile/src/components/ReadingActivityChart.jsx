// Reading Activity Chart - Shows pages read over last 30 days
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator, ScrollView } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { authAPI } from '../services/api';

const screenWidth = Dimensions.get('window').width;

export default function ReadingActivityChart({ userId = null }) {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState(null);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    loadReadingActivity();
  }, [userId]);

  const loadReadingActivity = async () => {
    try {
      setLoading(true);
      const token = await authAPI.getToken();
      const endpoint = userId 
        ? `/reading-activity/user/${userId}/daily?days=30`
        : '/reading-activity/daily?days=30';
      
      const response = await fetch(`https://book-tracker-backend-0hiz.onrender.com${endpoint}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to fetch reading activity');

      const data = await response.json();
      prepareChartData(data.data);
    } catch (error) {
      console.error('Error loading reading activity:', error);
      // Show empty chart on error
      setChartData({
        labels: [],
        datasets: [{ data: [0] }]
      });
    } finally {
      setLoading(false);
    }
  };

  const prepareChartData = (data) => {
    // Get last 30 days of data
    const last30Days = data.slice(-30);
    
    // Group by week (7-day chunks) for better visualization
    const weeklyData = [];
    const weekLabels = [];
    
    for (let i = 0; i < last30Days.length; i += 7) {
      const week = last30Days.slice(i, i + 7);
      const weekTotal = week.reduce((sum, day) => sum + day.pages_read, 0);
      weeklyData.push(weekTotal);
      
      // Label with week start date (simplified)
      const startDate = new Date(week[0].date);
      const label = `${startDate.getMonth() + 1}/${startDate.getDate()}`;
      weekLabels.push(label);
    }

    // Calculate total pages read in period
    const total = last30Days.reduce((sum, day) => sum + day.pages_read, 0);
    setTotalPages(total);

    setChartData({
      labels: weekLabels,
      datasets: [{
        data: weeklyData.length > 0 ? weeklyData : [0]
      }]
    });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>📊 Reading Activity (Last 30 Days)</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4285F4" />
        </View>
      </View>
    );
  }

  if (!chartData) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📊 Reading Activity (Last 30 Days)</Text>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <BarChart
          data={chartData}
          width={Math.max(screenWidth - 40, chartData.labels.length * 60)}
          height={220}
          yAxisLabel=""
          yAxisSuffix="p"
          chartConfig={{
            backgroundColor: '#ffffff',
            backgroundGradientFrom: '#ffffff',
            backgroundGradientTo: '#ffffff',
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(66, 133, 244, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
            style: {
              borderRadius: 16
            },
            propsForBackgroundLines: {
              strokeDasharray: '',
              stroke: '#e0e0e0',
              strokeWidth: 1
            },
            propsForLabels: {
              fontSize: 10
            }
          }}
          style={styles.chart}
          showBarTops={false}
          fromZero
        />
      </ScrollView>

      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{totalPages.toLocaleString()}</Text>
          <Text style={styles.summaryLabel}>Total Pages (30 days)</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{Math.round(totalPages / 30)}</Text>
          <Text style={styles.summaryLabel}>Avg Pages/Day</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
  },
  loadingContainer: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  summaryCard: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4285F4',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
});
