import React from 'react';

export default function Footer({ onRoute }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer style={{
      background: '#1f2937',
      color: 'white',
      padding: '3rem 2rem 1.5rem',
      marginTop: 'auto'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Main Footer Content */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '2rem',
          marginBottom: '2rem'
        }}>
          {/* About Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '2rem', marginRight: '0.5rem' }}>📖</span>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>TrackMyRead</h3>
            </div>
            <p style={{ color: '#9ca3af', lineHeight: '1.6' }}>
              Your social book tracking platform. Connect with readers, share your journey, and discover great books.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              Quick Links
            </h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              <FooterLink onClick={() => onRoute('about')}>About</FooterLink>
              <FooterLink onClick={() => onRoute('help')}>Help & FAQ</FooterLink>
              <FooterLink onClick={() => onRoute('contact')}>Contact Us</FooterLink>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              Legal
            </h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              <FooterLink onClick={() => onRoute('privacy')}>Privacy Policy</FooterLink>
              <FooterLink onClick={() => onRoute('terms')}>Terms of Service</FooterLink>
            </ul>
          </div>

          {/* Features */}
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              Features
            </h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              <li style={{ marginBottom: '0.5rem', color: '#9ca3af' }}>📚 Track Books</li>
              <li style={{ marginBottom: '0.5rem', color: '#9ca3af' }}>💭 Share Thoughts</li>
              <li style={{ marginBottom: '0.5rem', color: '#9ca3af' }}>👥 Connect with Readers</li>
              <li style={{ marginBottom: '0.5rem', color: '#9ca3af' }}>📊 Reading Stats</li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid #374151', marginBottom: '1.5rem' }}></div>

        {/* Bottom Footer */}
        <div style={{
          display: 'flex',
          flexDirection: window.innerWidth < 768 ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          fontSize: '0.875rem',
          color: '#9ca3af'
        }}>
          <div>
            © {currentYear} TrackMyRead. All rights reserved.
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <span>Made with ❤️ for book lovers</span>
            <span>Powered by Google Books</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ onClick, children }) {
  return (
    <li style={{ marginBottom: '0.5rem' }}>
      <a
        onClick={(e) => {
          e.preventDefault();
          onClick();
        }}
        href="#"
        style={{
          color: '#9ca3af',
          textDecoration: 'none',
          transition: 'color 0.2s',
          cursor: 'pointer'
        }}
        onMouseOver={(e) => e.target.style.color = 'white'}
        onMouseOut={(e) => e.target.style.color = '#9ca3af'}
      >
        {children}
      </a>
    </li>
  );
}
