import React, { useState } from 'react';

export default function AccountDeletionPage() {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('https://book-tracker-backend-0hiz.onrender.com/auth/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          reason: reason.trim() || null,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message || 'Account deletion request submitted successfully. Your account will be deleted within 30 days.');
        setEmail('');
        setReason('');
      } else {
        setError(data.detail || 'Failed to submit deletion request. Please try again.');
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '3rem 2rem', minHeight: 'calc(100vh - 200px)' }}>
      <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '1rem', color: '#667eea' }}>
        Account Deletion Request
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '1.125rem' }}>
        We're sorry to see you go. Submit your account deletion request below.
      </p>

      <div style={{
        backgroundColor: '#fef3c7',
        border: '1px solid #f59e0b',
        borderRadius: '8px',
        padding: '1.5rem',
        marginBottom: '2rem'
      }}>
        <h3 style={{ color: '#92400e', fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1.125rem' }}>
          ⚠️ Important Information
        </h3>
        <ul style={{ color: '#78350f', marginLeft: '1.5rem', lineHeight: '1.8' }}>
          <li>Account deletion is <strong>permanent</strong> and cannot be undone</li>
          <li>All your data including books, reading progress, notes, and social connections will be deleted</li>
          <li>Your account will be deleted within 30 days of this request</li>
          <li>You can contact us to cancel the deletion within this period</li>
        </ul>
      </div>

      <form onSubmit={handleSubmit} style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '2rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="email" style={{
            display: 'block',
            fontWeight: '600',
            marginBottom: '0.5rem',
            color: '#374151'
          }}>
            Email Address <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="Enter your registered email"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#667eea'}
            onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="reason" style={{
            display: 'block',
            fontWeight: '600',
            marginBottom: '0.5rem',
            color: '#374151'
          }}>
            Reason for Deletion (Optional)
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Help us improve by sharing why you're leaving"
            rows="4"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#667eea'}
            onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
          />
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #dc2626',
            color: '#991b1b',
            padding: '1rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.95rem'
          }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{
            backgroundColor: '#d1fae5',
            border: '1px solid #10b981',
            color: '#065f46',
            padding: '1rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.95rem'
          }}>
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '0.875rem',
            backgroundColor: loading ? '#9ca3af' : '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => !loading && (e.target.style.backgroundColor = '#b91c1c')}
          onMouseLeave={(e) => !loading && (e.target.style.backgroundColor = '#dc2626')}
        >
          {loading ? 'Submitting...' : 'Submit Deletion Request'}
        </button>
      </form>

      <div style={{
        marginTop: '2rem',
        padding: '1.5rem',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #e5e7eb'
      }}>
        <h3 style={{ fontWeight: 'bold', marginBottom: '0.75rem', color: '#1f2937' }}>
          Need Help?
        </h3>
        <p style={{ color: '#6b7280', marginBottom: '0.5rem', lineHeight: '1.6' }}>
          If you're experiencing issues with your account or have questions about deletion, please{' '}
          <a
            href="/#/contact"
            style={{ color: '#667eea', textDecoration: 'underline', fontWeight: '500' }}
          >
            contact our support team
          </a>
          {' '}before submitting a deletion request.
        </p>
        <p style={{ color: '#6b7280', lineHeight: '1.6' }}>
          Changed your mind? Simply don't submit this form and continue enjoying TrackMyRead!
        </p>
      </div>
    </div>
  );
}
