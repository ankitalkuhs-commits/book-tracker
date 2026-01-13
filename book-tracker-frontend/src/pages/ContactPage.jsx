import React from 'react';

export default function ContactPage() {
  return (
    <div style={{ minHeight: 'calc(100vh - 200px)' }}>
      <div style={{ 
        maxWidth: '800px', 
        margin: '0 auto', 
        padding: '4rem 2rem',
        textAlign: 'center'
      }}>
        <h1 style={{ 
          fontSize: '3rem', 
          fontWeight: 'bold', 
          marginBottom: '1rem', 
          color: '#667eea' 
        }}>
          Get in Touch
        </h1>
        <p style={{ 
          fontSize: '1.25rem', 
          color: '#6b7280', 
          marginBottom: '3rem' 
        }}>
          We'd love to hear from you! Whether you have questions, feedback, or need support.
        </p>

        <div style={{
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '3rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          marginBottom: '3rem'
        }}>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ 
              fontSize: '4rem', 
              marginBottom: '1rem' 
            }}>
              📧
            </div>
            <h2 style={{ 
              fontSize: '1.5rem', 
              fontWeight: 'bold', 
              marginBottom: '0.5rem',
              color: '#1f2937'
            }}>
              Email Us
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              For support, feedback, or inquiries
            </p>
            <a 
              href="mailto:ankitalkuhs@gmail.com"
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                color: '#667eea',
                textDecoration: 'none',
                padding: '0.75rem 2rem',
                border: '2px solid #667eea',
                borderRadius: '8px',
                display: 'inline-block',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.target.style.background = '#667eea';
                e.target.style.color = 'white';
              }}
              onMouseOut={(e) => {
                e.target.style.background = 'transparent';
                e.target.style.color = '#667eea';
              }}
            >
              ankitalkuhs@gmail.com
            </a>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1.5rem',
          marginBottom: '3rem'
        }}>
          <InfoCard 
            icon="❓"
            title="Need Help?"
            description="Check out our Help & FAQ page for quick answers to common questions."
            linkText="View FAQ"
            linkUrl="#/help"
          />
          <InfoCard 
            icon="🐛"
            title="Found a Bug?"
            description="Report technical issues or bugs to help us improve the platform."
            linkText="Report Issue"
            linkUrl="mailto:ankitalkuhs@gmail.com?subject=Bug Report"
          />
          <InfoCard 
            icon="💡"
            title="Feature Request?"
            description="Have an idea for a new feature? We'd love to hear your suggestions!"
            linkText="Suggest Feature"
            linkUrl="mailto:ankitalkuhs@gmail.com?subject=Feature Request"
          />
        </div>

        <div style={{
          padding: '2rem',
          background: '#f9fafb',
          borderRadius: '12px',
          borderLeft: '4px solid #667eea'
        }}>
          <h3 style={{ 
            fontWeight: 'bold', 
            marginBottom: '1rem',
            color: '#1f2937'
          }}>
            Response Time
          </h3>
          <p style={{ color: '#6b7280', lineHeight: '1.8' }}>
            We typically respond to inquiries within 24-48 hours during business days. For urgent issues affecting your account access, please mention "URGENT" in your email subject line.
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon, title, description, linkText, linkUrl }) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      padding: '2rem',
      textAlign: 'center',
      transition: 'transform 0.2s, box-shadow 0.2s'
    }}
    onMouseOver={(e) => {
      e.currentTarget.style.transform = 'translateY(-5px)';
      e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.12)';
    }}
    onMouseOut={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = 'none';
    }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{icon}</div>
      <h3 style={{ 
        fontSize: '1.25rem', 
        fontWeight: 'bold', 
        marginBottom: '0.75rem',
        color: '#1f2937'
      }}>
        {title}
      </h3>
      <p style={{ 
        color: '#6b7280', 
        marginBottom: '1rem',
        lineHeight: '1.6'
      }}>
        {description}
      </p>
      <a 
        href={linkUrl}
        style={{
          color: '#667eea',
          fontWeight: '600',
          textDecoration: 'none',
          borderBottom: '2px solid transparent',
          transition: 'border-color 0.2s'
        }}
        onMouseOver={(e) => e.target.style.borderBottomColor = '#667eea'}
        onMouseOut={(e) => e.target.style.borderBottomColor = 'transparent'}
      >
        {linkText} →
      </a>
    </div>
  );
}
