import React from 'react';

export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 2rem', minHeight: 'calc(100vh - 200px)' }}>
      <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '1rem', color: '#667eea' }}>
        Privacy Policy
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '3rem' }}>
        Last updated: January 13, 2026
      </p>

      <Section title="1. Introduction">
        <p>
          Welcome to TrackMyRead ("we," "our," or "us"). We respect your privacy and are committed to protecting your personal data. This privacy policy explains how we collect, use, and safeguard your information when you use our book tracking platform.
        </p>
      </Section>

      <Section title="2. Information We Collect">
        <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>2.1 Information You Provide</h3>
        <ul style={{ marginLeft: '2rem', lineHeight: '1.8' }}>
          <li>Account information (name, email address, password)</li>
          <li>Profile information (bio, profile picture)</li>
          <li>Reading data (books you track, reading status, notes, ratings)</li>
          <li>Social interactions (posts, comments, likes, follows)</li>
        </ul>

        <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>2.2 Automatically Collected Information</h3>
        <ul style={{ marginLeft: '2rem', lineHeight: '1.8' }}>
          <li>Login activity and last active date</li>
          <li>Device information and browser type</li>
          <li>Usage data and analytics</li>
        </ul>
      </Section>

      <Section title="3. How We Use Your Information">
        <p>We use your information to:</p>
        <ul style={{ marginLeft: '2rem', lineHeight: '1.8' }}>
          <li>Provide and maintain our service</li>
          <li>Enable social features (following, feed, sharing)</li>
          <li>Track your reading progress and statistics</li>
          <li>Improve and personalize your experience</li>
          <li>Send important updates about our service</li>
          <li>Ensure platform security and prevent abuse</li>
        </ul>
      </Section>

      <Section title="4. Data Sharing and Disclosure">
        <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>4.1 Public Information</h3>
        <p>
          Your posts, reading activity, and profile information may be visible to other users based on your privacy settings. Books you add and posts you create are public by default.
        </p>

        <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>4.2 Third-Party Services</h3>
        <p>
          We use third-party services for hosting (Render, Vercel), image storage (Cloudinary), and book data (Google Books API). These services have their own privacy policies.
        </p>

        <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>4.3 Legal Requirements</h3>
        <p>
          We may disclose your information if required by law or to protect our rights, safety, or property.
        </p>
      </Section>

      <Section title="5. Data Security">
        <p>
          We implement security measures to protect your data, including:
        </p>
        <ul style={{ marginLeft: '2rem', lineHeight: '1.8' }}>
          <li>Password encryption using bcrypt</li>
          <li>Secure HTTPS connections</li>
          <li>JWT-based authentication</li>
          <li>Regular security updates</li>
        </ul>
        <p style={{ marginTop: '1rem' }}>
          However, no method of transmission over the internet is 100% secure. We cannot guarantee absolute security.
        </p>
      </Section>

      <Section title="6. Your Rights">
        <p>You have the right to:</p>
        <ul style={{ marginLeft: '2rem', lineHeight: '1.8' }}>
          <li><strong>Access:</strong> Request a copy of your personal data</li>
          <li><strong>Correction:</strong> Update or correct your information</li>
          <li><strong>Deletion:</strong> Request deletion of your account and data</li>
          <li><strong>Export:</strong> Download your reading data</li>
          <li><strong>Opt-out:</strong> Unsubscribe from non-essential communications</li>
        </ul>
        <p style={{ marginTop: '1rem' }}>
          To exercise these rights, please contact us at the email provided on our Contact page.
        </p>
      </Section>

      <Section title="7. Cookies and Tracking">
        <p>
          We use local storage to maintain your login session. We do not use third-party tracking cookies for advertising purposes.
        </p>
      </Section>

      <Section title="8. Children's Privacy">
        <p>
          Our service is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe we have collected such information, please contact us immediately.
        </p>
      </Section>

      <Section title="9. Data Retention">
        <p>
          We retain your personal data as long as your account is active or as needed to provide services. You may request account deletion at any time.
        </p>
      </Section>

      <Section title="10. International Users">
        <p>
          Your data may be stored and processed in servers located outside your country. By using our service, you consent to this transfer.
        </p>
      </Section>

      <Section title="11. Changes to This Policy">
        <p>
          We may update this privacy policy from time to time. We will notify you of significant changes by posting the new policy on this page and updating the "Last updated" date.
        </p>
      </Section>

      <Section title="12. Contact Us">
        <p>
          If you have questions about this privacy policy, please visit our Contact page or check our Help section for more information.
        </p>
      </Section>

      <div style={{ 
        marginTop: '3rem', 
        padding: '1.5rem', 
        background: '#f9fafb', 
        borderRadius: '8px',
        borderLeft: '4px solid #667eea'
      }}>
        <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Summary</p>
        <p style={{ color: '#6b7280' }}>
          We collect the information you provide when using TrackMyRead, use it to provide our service, and protect it with industry-standard security measures. You have full control over your data and can request access, correction, or deletion at any time.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1f2937' }}>
        {title}
      </h2>
      <div style={{ color: '#374151', lineHeight: '1.8' }}>
        {children}
      </div>
    </div>
  );
}
