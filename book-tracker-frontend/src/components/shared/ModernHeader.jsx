// Modern Header for Track My Read
import React from 'react';

export default function ModernHeader({ user, onRoute, onLogout, route }) {
  const navItems = [
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'my-library', label: 'My Library', icon: '📚' },
    { id: 'about', label: 'About', icon: 'ℹ️' },
  ];

  // Add admin link if user is admin
  if (user?.is_admin) {
    navItems.push({ id: 'admin', label: 'Admin', icon: '🔐' });
  }

  const getInitials = () => {
    if (!user?.name) return 'U';
    return user.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="modern-header">
      <div className="modern-header-container">
        {/* Logo */}
        <div className="header-logo" onClick={() => onRoute('home')}>
          <div className="logo-icon">📖</div>
          <h1 className="logo-text">Track My Read</h1>
        </div>

        {/* Navigation */}
        <nav className="header-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onRoute(item.id)}
              className={`nav-button ${route === item.id ? 'active' : ''}`}
            >
              <span className="icon">{item.icon}</span>
              <span className="label">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* User Menu */}
        <div className="header-nav">
          {!localStorage.getItem('bt_token') ? (
            <>
              <button onClick={() => onRoute('login')} className="nav-button">
                Login
              </button>
              <button onClick={() => onRoute('signup')} className="btn-primary">
                Sign Up
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onRoute('profile')}
                className="user-avatar"
                title="Profile"
              >
                {getInitials()}
              </button>
              <button onClick={onLogout} className="nav-button">
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
