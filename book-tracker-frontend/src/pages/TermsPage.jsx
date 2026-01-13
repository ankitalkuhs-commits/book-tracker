import React from 'react';

export default function TermsPage() {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 2rem', minHeight: 'calc(100vh - 200px)' }}>
      <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '1rem', color: '#667eea' }}>
        Terms of Service
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '3rem' }}>
        Last updated: January 13, 2026
      </p>

      <Section title="1. Acceptance of Terms">
        <p>
          By accessing and using TrackMyRead ("the Service"), you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our Service.
        </p>
      </Section>

      <Section title="2. Description of Service">
        <p>
          TrackMyRead is a social book tracking platform that allows users to:
        </p>
        <ul style={{ marginLeft: '2rem', lineHeight: '1.8' }}>
          <li>Track books they are reading, want to read, or have finished</li>
          <li>Share reading progress, thoughts, and emotions</li>
          <li>Connect with other readers through social features</li>
          <li>Discover new books and track reading statistics</li>
        </ul>
      </Section>

      <Section title="3. User Accounts">
        <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>3.1 Registration</h3>
        <p>
          To use certain features, you must create an account with accurate and complete information. You are responsible for maintaining the confidentiality of your password.
        </p>

        <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>3.2 Account Responsibility</h3>
        <p>
          You are responsible for all activities that occur under your account. Notify us immediately of any unauthorized use.
        </p>

        <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>3.3 Age Requirement</h3>
        <p>
          You must be at least 13 years old to use this Service.
        </p>
      </Section>

      <Section title="4. User Content">
        <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>4.1 Your Content</h3>
        <p>
          You retain ownership of content you post (notes, reviews, comments, posts). By posting content, you grant us a non-exclusive, worldwide license to use, display, and distribute your content on the Service.
        </p>

        <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>4.2 Prohibited Content</h3>
        <p>You agree not to post content that:</p>
        <ul style={{ marginLeft: '2rem', lineHeight: '1.8' }}>
          <li>Violates laws or regulations</li>
          <li>Infringes on intellectual property rights</li>
          <li>Contains hate speech, harassment, or threats</li>
          <li>Contains spam or misleading information</li>
          <li>Contains malicious code or viruses</li>
          <li>Impersonates others or misrepresents affiliation</li>
        </ul>

        <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>4.3 Content Moderation</h3>
        <p>
          We reserve the right to remove content that violates these terms or is otherwise objectionable, without notice.
        </p>
      </Section>

      <Section title="5. Acceptable Use">
        <p>You agree not to:</p>
        <ul style={{ marginLeft: '2rem', lineHeight: '1.8' }}>
          <li>Use the Service for illegal purposes</li>
          <li>Attempt to gain unauthorized access to our systems</li>
          <li>Interfere with or disrupt the Service</li>
          <li>Use automated scripts to collect data (scraping)</li>
          <li>Create multiple accounts to manipulate features</li>
          <li>Sell, transfer, or sublicense your account</li>
        </ul>
      </Section>

      <Section title="6. Third-Party Services">
        <p>
          Our Service integrates with third-party services including:
        </p>
        <ul style={{ marginLeft: '2rem', lineHeight: '1.8' }}>
          <li>Google Books API for book data and search</li>
          <li>Cloudinary for image storage</li>
          <li>Google OAuth for authentication (optional)</li>
        </ul>
        <p style={{ marginTop: '1rem' }}>
          These services have their own terms and privacy policies. We are not responsible for third-party services.
        </p>
      </Section>

      <Section title="7. Intellectual Property">
        <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>7.1 Our Property</h3>
        <p>
          The Service, including its design, features, and code, is owned by TrackMyRead and protected by copyright and other intellectual property laws.
        </p>

        <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>7.2 Book Data</h3>
        <p>
          Book information, covers, and metadata are provided by Google Books and are subject to their respective copyrights.
        </p>
      </Section>

      <Section title="8. Termination">
        <p>
          We may suspend or terminate your account at any time for violations of these terms or for any other reason. You may delete your account at any time through your profile settings.
        </p>
        <p style={{ marginTop: '1rem' }}>
          Upon termination, your right to use the Service immediately ceases. We may retain certain information as required by law or for legitimate business purposes.
        </p>
      </Section>

      <Section title="9. Disclaimers">
        <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>9.1 "As Is" Service</h3>
        <p>
          The Service is provided "as is" without warranties of any kind, either express or implied. We do not guarantee that the Service will be uninterrupted, secure, or error-free.
        </p>

        <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>9.2 Content Accuracy</h3>
        <p>
          We do not verify user-generated content or book data. You use the Service and rely on content at your own risk.
        </p>
      </Section>

      <Section title="10. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, TrackMyRead shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of data, revenue, or profits, arising from your use of the Service.
        </p>
      </Section>

      <Section title="11. Indemnification">
        <p>
          You agree to indemnify and hold TrackMyRead harmless from any claims, damages, or expenses arising from your use of the Service or violation of these terms.
        </p>
      </Section>

      <Section title="12. Changes to Terms">
        <p>
          We reserve the right to modify these terms at any time. We will notify users of significant changes by posting the new terms on this page and updating the "Last updated" date. Continued use of the Service after changes constitutes acceptance of the new terms.
        </p>
      </Section>

      <Section title="13. Governing Law">
        <p>
          These terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles.
        </p>
      </Section>

      <Section title="14. Contact Information">
        <p>
          If you have questions about these Terms of Service, please visit our Contact page or Help section.
        </p>
      </Section>

      <div style={{ 
        marginTop: '3rem', 
        padding: '1.5rem', 
        background: '#f9fafb', 
        borderRadius: '8px',
        borderLeft: '4px solid #667eea'
      }}>
        <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Key Points</p>
        <ul style={{ color: '#6b7280', marginLeft: '1.5rem', lineHeight: '1.8' }}>
          <li>You own your content but grant us rights to display it</li>
          <li>Be respectful and follow community guidelines</li>
          <li>Don't abuse the service or violate laws</li>
          <li>We can modify these terms with notice</li>
          <li>Service is provided "as is" without warranties</li>
        </ul>
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
