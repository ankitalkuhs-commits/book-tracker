// PostComposer - Create new emotional posts about books
import React, { useState } from 'react';
import { apiFetch } from '../../services/api';

export default function PostComposer({ user, onPostCreated }) {
  const [text, setText] = useState('');
  const [emotion, setEmotion] = useState('');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [quote, setQuote] = useState('');
  const [showQuoteInput, setShowQuoteInput] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const fileInputRef = React.useRef(null);

  const handleShare = async () => {
    if (!text.trim()) {
      alert('Please add some text');
      return;
    }

    setIsPosting(true);
    try {
      let imageUrl = null;
      
      // Upload image first if one is selected
      if (image) {
        const formData = new FormData();
        formData.append('file', image);
        
        const uploadResult = await apiFetch('/notes/upload-image', {
          method: 'POST',
          body: formData,
          // Don't pass headers at all - let apiFetch handle it
        });
        
        imageUrl = uploadResult.image_url;
      }

      // Create the post with image URL
      const result = await apiFetch('/notes/', {
        method: 'POST',
        body: JSON.stringify({
          text: text.trim(),
          emotion,
          image_url: imageUrl,
          quote: quote.trim() || null,
          is_public: true,
        }),
      });

      console.log('Post created successfully:', result);
      
      // Clear form
      setText('');
      setEmotion('');
      setImage(null);
      setImagePreview(null);
      setQuote('');
      setShowQuoteInput(false);
      
      // Trigger feed refresh
      if (onPostCreated) onPostCreated();
      
      // Show success message (you can replace with a nicer toast notification)
      alert('Pulse shared successfully!');
    } catch (error) {
      console.error('Error creating post:', error);
      alert(`Failed to create post: ${error.message}`);
    } finally {
      setIsPosting(false);
    }
  };

  // Handle image selection
  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size should be less than 5MB');
        return;
      }
      
      setImage(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Remove selected image
  const handleRemoveImage = () => {
    setImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Toggle quote input
  const handleToggleQuote = () => {
    setShowQuoteInput(!showQuoteInput);
    if (showQuoteInput) {
      setQuote(''); // Clear quote when closing
    }
  };

  // Get user initials for avatar
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
    <div className="card">
      {/* Header with user avatar */}
      <div className="post-composer">
        {/* User Avatar */}
        <div className="post-avatar">
          {getInitials()}
        </div>

        <div style={{ flex: 1 }}>
          {/* Text Input */}
          <textarea
            placeholder="What are you feeling from your read?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows="3"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontFamily: 'inherit',
              fontSize: '1rem',
              resize: 'none',
              marginBottom: '1rem'
            }}
          />

          {/* Image Preview */}
          {imagePreview && (
            <div style={{ 
              position: 'relative', 
              marginBottom: '1rem',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid #e2e8f0'
            }}>
              <img 
                src={imagePreview} 
                alt="Preview" 
                style={{ 
                  width: '100%', 
                  maxHeight: '300px', 
                  objectFit: 'cover' 
                }} 
              />
              <button
                onClick={handleRemoveImage}
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  background: 'rgba(0, 0, 0, 0.6)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Remove image"
              >
                ×
              </button>
            </div>
          )}

          {/* Quote Input */}
          {showQuoteInput && (
            <div style={{ 
              marginBottom: '1rem',
              padding: '1rem',
              background: '#F9FAFB',
              border: '2px solid #E5E7EB',
              borderLeft: '4px solid #6366F1',
              borderRadius: '8px',
              position: 'relative'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                marginBottom: '0.5rem'
              }}>
                <span style={{ fontSize: '1.5rem' }}>💬</span>
                <button
                  onClick={handleToggleQuote}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '20px',
                    color: '#6B7280',
                    padding: 0
                  }}
                  title="Remove quote"
                >
                  ×
                </button>
              </div>
              <textarea
                placeholder="Add a quote from the book..."
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                rows="3"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  fontFamily: 'inherit',
                  fontSize: '0.95rem',
                  fontStyle: 'italic',
                  resize: 'none',
                  background: 'white'
                }}
              />
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageSelect}
            style={{ display: 'none' }}
          />

          {/* Action buttons */}
          <div className="action-buttons">
            <div className="action-group">
              <button 
                className="icon-btn" 
                title="Add image"
                onClick={() => fileInputRef.current?.click()}
              >
                🖼️
              </button>
              <button 
                className="icon-btn" 
                title="Add quote"
                onClick={handleToggleQuote}
                style={{ 
                  background: showQuoteInput ? '#EEF2FF' : 'transparent',
                  color: showQuoteInput ? '#6366F1' : 'inherit'
                }}
              >
                💬
              </button>
              <button className="icon-btn" title="Tag user">
                @
              </button>
            </div>

            {/* Share button */}
            <button
              onClick={handleShare}
              disabled={isPosting || !text.trim()}
              className="btn-primary"
              style={{ opacity: (!text.trim() || isPosting) ? 0.5 : 1 }}
            >
              {isPosting ? 'Sharing...' : 'Share Pulse'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
