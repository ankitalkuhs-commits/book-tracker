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
      
      alert('Pulse shared successfully!');
    } catch (error) {
      console.error('Error creating post:', error);
      alert(`Failed to create post: ${error.message}`);
    } finally {
      setIsPosting(false);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size should be less than 5MB');
        return;
      }
      
      setImage(file);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleToggleQuote = () => {
    setShowQuoteInput(!showQuoteInput);
    if (showQuoteInput) {
      setQuote('');
    }
  };

  return (
    <div className="card">
      <div className="post-composer">
        <div className="flex-1">
          {/* Text Input */}
          <textarea
            placeholder="What are you feeling from your read?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows="2"
            className="post-composer-textarea"
          />

          {/* Image Preview */}
          {imagePreview && (
            <div className="image-preview">
              <img src={imagePreview} alt="Preview" />
              <button
                onClick={handleRemoveImage}
                className="image-preview-close"
                title="Remove image"
              >
                ×
              </button>
            </div>
          )}

          {/* Quote Input */}
          {showQuoteInput && (
            <div className="quote-box">
              <div className="quote-box-header">
                <span className="quote-icon">💬</span>
                <button
                  onClick={handleToggleQuote}
                  className="quote-close"
                  title="Remove quote"
                >
                  ×
                </button>
              </div>
              <textarea
                placeholder="Add a quote from the book..."
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                rows="2"
                className="quote-textarea"
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
            className="hidden"
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
                className={`icon-btn ${showQuoteInput ? 'active' : ''}`}
                title="Add quote"
                onClick={handleToggleQuote}
              >
                💬
              </button>
            </div>

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
