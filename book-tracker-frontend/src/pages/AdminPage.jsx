import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';

export default function AdminPage() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [books, setBooks] = useState([]);
  const [follows, setFollows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('stats');

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, usersData, booksData, followsData] = await Promise.all([
        apiFetch('/admin/stats'),
        apiFetch('/admin/users?limit=50'),
        apiFetch('/admin/books?limit=30'),
        apiFetch('/admin/follows?limit=50')
      ]);
      
      setStats(statsData);
      setUsers(usersData);
      setBooks(booksData);
      setFollows(followsData);
    } catch (err) {
      if (err.response?.status === 403) {
        setError('Admin access required. You do not have permission to view this page.');
      } else {
        setError('Failed to load admin data. ' + (err.message || 'Please try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Loading Admin Dashboard...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>❌ Access Denied</h2>
        <p style={{ color: '#dc2626' }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '2rem', maxWidth: '1400px' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          🔐 Admin Dashboard
        </h1>
        <p style={{ color: '#6b7280' }}>Platform statistics and management</p>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>📊 Platform Statistics</h2>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <StatCard title="Total Users" value={stats.total_users} icon="👥" />
            <StatCard title="New (This Week)" value={stats.new_users_this_week} icon="🆕" color="#10b981" />
            <StatCard title="New (This Month)" value={stats.new_users_this_month} icon="📅" color="#3b82f6" />
            <StatCard title="Total Books" value={stats.total_books} icon="📚" />
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <StatCard title="Books in Libraries" value={stats.total_userbooks} icon="📖" />
            <StatCard title="Currently Reading" value={stats.books_being_read} icon="📗" color="#f59e0b" />
            <StatCard title="Completed" value={stats.books_completed} icon="✅" color="#10b981" />
            <StatCard title="Wishlist" value={stats.books_wishlist} icon="⭐" color="#8b5cf6" />
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem'
          }}>
            <StatCard title="Total Notes" value={stats.total_notes} icon="📝" />
            <StatCard title="Follow Relationships" value={stats.total_follows} icon="🔗" />
            <StatCard title="Journal Entries" value={stats.total_journals} icon="📓" />
            <StatCard title="Likes" value={stats.total_likes} icon="❤️" />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ 
        borderBottom: '2px solid #e5e7eb',
        marginBottom: '2rem',
        display: 'flex',
        gap: '2rem'
      }}>
        {['stats', 'users', 'books', 'network'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '0.75rem 0',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #667eea' : '2px solid transparent',
              color: activeTab === tab ? '#667eea' : '#6b7280',
              fontWeight: activeTab === tab ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'users' && (
        <UsersTable users={users} />
      )}

      {activeTab === 'books' && (
        <BooksTable books={books} />
      )}

      {activeTab === 'network' && (
        <NetworkView follows={follows} />
      )}
    </div>
  );
}

function StatCard({ title, value, icon, color = '#667eea' }) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '1.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
            {title}
          </p>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color }}>
            {value.toLocaleString()}
          </p>
        </div>
        <span style={{ fontSize: '2rem' }}>{icon}</span>
      </div>
    </div>
  );
}

function UsersTable({ users }) {
  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>👥 All Users</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={tableHeaderStyle}>ID</th>
              <th style={tableHeaderStyle}>Name</th>
              <th style={tableHeaderStyle}>Username</th>
              <th style={tableHeaderStyle}>Email</th>
              <th style={tableHeaderStyle}>Books</th>
              <th style={tableHeaderStyle}>Followers</th>
              <th style={tableHeaderStyle}>Following</th>
              <th style={tableHeaderStyle}>Joined</th>
              <th style={tableHeaderStyle}>Admin</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={tableCellStyle}>{user.id}</td>
                <td style={tableCellStyle}>{user.name || '-'}</td>
                <td style={tableCellStyle}>@{user.username || `user${user.id}`}</td>
                <td style={tableCellStyle}>{user.email}</td>
                <td style={tableCellStyle}>{user.books_count}</td>
                <td style={tableCellStyle}>{user.followers_count}</td>
                <td style={tableCellStyle}>{user.following_count}</td>
                <td style={tableCellStyle}>
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td style={tableCellStyle}>
                  {user.is_admin && <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BooksTable({ books }) {
  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>📚 Popular Books</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={tableHeaderStyle}>ID</th>
              <th style={tableHeaderStyle}>Title</th>
              <th style={tableHeaderStyle}>Author</th>
              <th style={tableHeaderStyle}>Reading</th>
              <th style={tableHeaderStyle}>Completed</th>
              <th style={tableHeaderStyle}>Total Users</th>
            </tr>
          </thead>
          <tbody>
            {books.map(book => (
              <tr key={book.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={tableCellStyle}>{book.id}</td>
                <td style={tableCellStyle}>{book.title}</td>
                <td style={tableCellStyle}>{book.author || '-'}</td>
                <td style={tableCellStyle}>{book.users_reading}</td>
                <td style={tableCellStyle}>{book.users_completed}</td>
                <td style={{ ...tableCellStyle, fontWeight: 'bold' }}>{book.total_users}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NetworkView({ follows }) {
  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>🔗 Follow Network</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={tableHeaderStyle}>Follower</th>
              <th style={tableHeaderStyle}></th>
              <th style={tableHeaderStyle}>Following</th>
              <th style={tableHeaderStyle}>Since</th>
            </tr>
          </thead>
          <tbody>
            {follows.map((follow, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={tableCellStyle}>{follow.follower_name}</td>
                <td style={{ ...tableCellStyle, textAlign: 'center' }}>→</td>
                <td style={tableCellStyle}>{follow.followed_name}</td>
                <td style={tableCellStyle}>
                  {new Date(follow.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const tableHeaderStyle = {
  padding: '0.75rem',
  textAlign: 'left',
  fontSize: '0.875rem',
  fontWeight: '600',
  color: '#374151'
};

const tableCellStyle = {
  padding: '0.75rem',
  fontSize: '0.875rem',
  color: '#1f2937'
};
