import React, { useState } from 'react';

export default function HelpPage() {
  const [openId, setOpenId] = useState(null);

  const toggleFAQ = (id) => {
    setOpenId(openId === id ? null : id);
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 2rem', minHeight: 'calc(100vh - 200px)' }}>
      <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '1rem', color: '#667eea' }}>
        Help & FAQ
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '3rem', fontSize: '1.125rem' }}>
        Find answers to common questions about using TrackMyRead.
      </p>

      <div style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#1f2937' }}>
          Getting Started
        </h2>
        
        <FAQItem
          id="signup"
          question="How do I create an account?"
          answer="Click the 'Sign Up' button in the top right corner. Enter your name, email, and a secure password (at least 8 characters). You can also sign up using Google OAuth for faster registration."
          isOpen={openId === 'signup'}
          onToggle={() => toggleFAQ('signup')}
        />

        <FAQItem
          id="login"
          question="I forgot my password. How do I reset it?"
          answer="Currently, password reset functionality is in development. Please contact us through the Contact page with your registered email, and we'll help you regain access to your account."
          isOpen={openId === 'login'}
          onToggle={() => toggleFAQ('login')}
        />

        <FAQItem
          id="profile"
          question="How do I update my profile?"
          answer="Click on your avatar in the top right, then select 'Profile'. From there, you can edit your name, bio, and upload a profile picture."
          isOpen={openId === 'profile'}
          onToggle={() => toggleFAQ('profile')}
        />
      </div>

      <div style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#1f2937' }}>
          Managing Books
        </h2>
        
        <FAQItem
          id="addbook"
          question="How do I add a book to my library?"
          answer="Go to 'My Library' and click the 'Add Book' button. Search for the book using the title, author, or ISBN. Select the book from the search results, choose your reading status (Want to Read, Currently Reading, or Finished), and click 'Add to Library'."
          isOpen={openId === 'addbook'}
          onToggle={() => toggleFAQ('addbook')}
        />

        <FAQItem
          id="updatestatus"
          question="How do I change a book's reading status?"
          answer="In 'My Library', click on any book card to open the book details modal. You can update the status, add ratings, track your current page, and add private notes."
          isOpen={openId === 'updatestatus'}
          onToggle={() => toggleFAQ('updatestatus')}
        />

        <FAQItem
          id="removebook"
          question="Can I remove a book from my library?"
          answer="Yes! Open the book details modal by clicking on the book card, then click the 'Remove from Library' button at the bottom of the modal."
          isOpen={openId === 'removebook'}
          onToggle={() => toggleFAQ('removebook')}
        />

        <FAQItem
          id="bookformat"
          question="Can I track different book formats?"
          answer="Yes! When adding or editing a book, you can specify the format (Hardcover, Paperback, eBook, Kindle, PDF, or Audiobook) and ownership status (Owned, Borrowed, or Loaned)."
          isOpen={openId === 'bookformat'}
          onToggle={() => toggleFAQ('bookformat')}
        />
      </div>

      <div style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#1f2937' }}>
          Social Features
        </h2>
        
        <FAQItem
          id="post"
          question="How do I share my reading progress?"
          answer="On the Home page, use the Post Composer at the top to create a new post. You can share text updates, quotes from the book you're reading, select an emotion, and even upload images."
          isOpen={openId === 'post'}
          onToggle={() => toggleFAQ('post')}
        />

        <FAQItem
          id="follow"
          question="How do I follow other readers?"
          answer="Click 'Find Friends' in the sidebar or navigation. Search for users by name and click the 'Follow' button next to their name. You'll see their posts in your community feed."
          isOpen={openId === 'follow'}
          onToggle={() => toggleFAQ('follow')}
        />

        <FAQItem
          id="like"
          question="Can I like or comment on posts?"
          answer="Yes! You can like posts by clicking the heart icon. Comment functionality is currently in development and will be available in a future update."
          isOpen={openId === 'like'}
          onToggle={() => toggleFAQ('like')}
        />

        <FAQItem
          id="editpost"
          question="Can I edit my posts?"
          answer="Yes! Click the pencil/edit icon on any of your own posts to modify the text, emotion, or image. You cannot edit other users' posts."
          isOpen={openId === 'editpost'}
          onToggle={() => toggleFAQ('editpost')}
        />
      </div>

      <div style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#1f2937' }}>
          Reading Statistics
        </h2>
        
        <FAQItem
          id="stats"
          question="Where can I see my reading statistics?"
          answer="Your reading stats are displayed in the sidebar on the Home page and in your Profile. You can see total books, books finished, currently reading, and books on your to-read list."
          isOpen={openId === 'stats'}
          onToggle={() => toggleFAQ('stats')}
        />

        <FAQItem
          id="goals"
          question="Can I set reading goals?"
          answer="Reading goals and challenges are planned for a future update. Stay tuned!"
          isOpen={openId === 'goals'}
          onToggle={() => toggleFAQ('goals')}
        />
      </div>

      <div style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#1f2937' }}>
          Privacy & Security
        </h2>
        
        <FAQItem
          id="privacy"
          question="Who can see my reading activity?"
          answer="Your posts and reading activity are public by default and visible to other users on the platform. Private notes you add to books are only visible to you."
          isOpen={openId === 'privacy'}
          onToggle={() => toggleFAQ('privacy')}
        />

        <FAQItem
          id="delete"
          question="How do I delete my account?"
          answer="To delete your account, please contact us through the Contact page. We'll process your request and permanently remove your data in accordance with our Privacy Policy."
          isOpen={openId === 'delete'}
          onToggle={() => toggleFAQ('delete')}
        />
      </div>

      <div style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#1f2937' }}>
          Troubleshooting
        </h2>
        
        <FAQItem
          id="search"
          question="I can't find a book I'm searching for. What should I do?"
          answer="Try searching with different keywords - use the full title, author name, or ISBN. Our book search is powered by Google Books API, which has millions of titles. If a book still doesn't appear, it may not be in the Google Books database."
          isOpen={openId === 'search'}
          onToggle={() => toggleFAQ('search')}
        />

        <FAQItem
          id="images"
          question="Why aren't my uploaded images showing?"
          answer="Images are stored on Cloudinary and should load automatically. If images aren't displaying, try refreshing the page. Make sure your uploaded images are in a supported format (JPG, PNG, GIF) and under 10MB."
          isOpen={openId === 'images'}
          onToggle={() => toggleFAQ('images')}
        />
      </div>

      <div style={{ 
        marginTop: '3rem', 
        padding: '2rem', 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        borderRadius: '12px',
        textAlign: 'center'
      }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          Still have questions?
        </h2>
        <p style={{ marginBottom: '1.5rem', opacity: 0.9 }}>
          We're here to help! Visit our Contact page to get in touch.
        </p>
        <button 
          onClick={() => window.location.href = '#/contact'}
          style={{
            background: 'white',
            color: '#667eea',
            padding: '0.75rem 2rem',
            fontSize: '1.125rem',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
          }}
        >
          Contact Us
        </button>
      </div>
    </div>
  );
}

function FAQItem({ id, question, answer, isOpen, onToggle }) {
  return (
    <div style={{
      marginBottom: '1rem',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      overflow: 'hidden',
      transition: 'box-shadow 0.2s'
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '1.25rem',
          background: isOpen ? '#f9fafb' : 'white',
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '1.125rem',
          fontWeight: 'bold',
          color: '#1f2937'
        }}
      >
        <span>{question}</span>
        <span style={{ fontSize: '1.5rem', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div style={{
          padding: '1.25rem',
          borderTop: '1px solid #e5e7eb',
          background: 'white',
          color: '#6b7280',
          lineHeight: '1.8'
        }}>
          {answer}
        </div>
      )}
    </div>
  );
}
