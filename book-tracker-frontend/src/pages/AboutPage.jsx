import React from 'react';

export default function AboutPage() {
  return (
    <div style={{ 
      minHeight: 'calc(100vh - 200px)', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      paddingBottom: '4rem'
    }}>
      {/* Hero Section */}
      <div style={{ 
        maxWidth: '1200px', 
        margin: '0 auto', 
        padding: '4rem 2rem',
        textAlign: 'center'
      }}>
        <h1 style={{ 
          fontSize: '3.5rem', 
          fontWeight: 'bold', 
          marginBottom: '1.5rem',
          lineHeight: '1.2'
        }}>
          Track Your Reading Journey
        </h1>
        <p style={{ 
          fontSize: '1.5rem', 
          marginBottom: '2rem',
          opacity: 0.9,
          maxWidth: '800px',
          margin: '0 auto 2rem'
        }}>
          Connect with fellow readers, share your thoughts, and discover your next favorite book.
        </p>
        <button 
          onClick={() => window.location.href = '#/signup'}
          style={{
            background: 'white',
            color: '#667eea',
            padding: '1rem 3rem',
            fontSize: '1.25rem',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
            transition: 'transform 0.2s'
          }}
          onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
          onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
        >
          Get Started Free
        </button>
      </div>

      {/* Features Section */}
      <div style={{ 
        background: 'white', 
        color: '#1f2937',
        padding: '4rem 2rem'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ 
            fontSize: '2.5rem', 
            fontWeight: 'bold', 
            textAlign: 'center',
            marginBottom: '3rem',
            color: '#667eea'
          }}>
            Why TrackMyRead?
          </h2>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '2rem',
            marginBottom: '3rem'
          }}>
            <FeatureCard 
              icon="📚"
              title="Organize Your Library"
              description="Keep track of books you're reading, want to read, and have finished. Never lose track of your reading list again."
            />
            <FeatureCard 
              icon="💭"
              title="Share Your Thoughts"
              description="Post reading emotions, quotes, and insights. Connect with others through your reading journey."
            />
            <FeatureCard 
              icon="👥"
              title="Connect with Readers"
              description="Follow friends and discover what they're reading. Build your reading community."
            />
            <FeatureCard 
              icon="📊"
              title="Track Your Progress"
              description="Monitor your reading stats, see how many books you've completed, and celebrate milestones."
            />
            <FeatureCard 
              icon="🔍"
              title="Discover Books"
              description="Search millions of books powered by Google Books. Find your next great read easily."
            />
            <FeatureCard 
              icon="🎯"
              title="Reading Goals"
              description="Set and achieve your reading goals. Track pages read, books finished, and more."
            />
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div style={{ 
        background: '#f9fafb',
        padding: '4rem 2rem'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ 
            fontSize: '2.5rem', 
            fontWeight: 'bold', 
            textAlign: 'center',
            marginBottom: '3rem',
            color: '#667eea'
          }}>
            How It Works
          </h2>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '2rem'
          }}>
            <StepCard 
              number="1"
              title="Sign Up Free"
              description="Create your account in seconds. No credit card required."
            />
            <StepCard 
              number="2"
              title="Add Your Books"
              description="Search and add books to your library. Track your reading status."
            />
            <StepCard 
              number="3"
              title="Share & Connect"
              description="Post updates, follow friends, and join the reading community."
            />
            <StepCard 
              number="4"
              title="Track & Grow"
              description="Monitor your progress and celebrate your reading achievements."
            />
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div style={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '4rem 2rem',
        textAlign: 'center'
      }}>
        <h2 style={{ 
          fontSize: '2.5rem', 
          fontWeight: 'bold', 
          marginBottom: '1.5rem'
        }}>
          Ready to Start Your Reading Journey?
        </h2>
        <p style={{ 
          fontSize: '1.25rem', 
          marginBottom: '2rem',
          opacity: 0.9
        }}>
          Join thousands of readers tracking their books and sharing their stories.
        </p>
        <button 
          onClick={() => window.location.href = '#/signup'}
          style={{
            background: 'white',
            color: '#667eea',
            padding: '1rem 3rem',
            fontSize: '1.25rem',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
            transition: 'transform 0.2s'
          }}
          onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
          onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
        >
          Sign Up Now
        </button>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      padding: '2rem',
      textAlign: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      transition: 'transform 0.2s, box-shadow 0.2s'
    }}
    onMouseOver={(e) => {
      e.currentTarget.style.transform = 'translateY(-5px)';
      e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.15)';
    }}
    onMouseOut={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{icon}</div>
      <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1f2937' }}>
        {title}
      </h3>
      <p style={{ color: '#6b7280', lineHeight: '1.6' }}>{description}</p>
    </div>
  );
}

function StepCard({ number, title, description }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: '60px',
        height: '60px',
        background: '#667eea',
        color: 'white',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '2rem',
        fontWeight: 'bold',
        margin: '0 auto 1rem'
      }}>
        {number}
      </div>
      <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1f2937' }}>
        {title}
      </h3>
      <p style={{ color: '#6b7280', lineHeight: '1.6' }}>{description}</p>
    </div>
  );
}
