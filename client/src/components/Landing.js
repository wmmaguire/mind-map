import { useState } from 'react';
import './Landing.css';
import { apiUrl } from '../config';
import { useSession } from '../context/SessionContext';

function Landing() {
  const { sessionId } = useSession();
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [rating, setRating] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [category, setCategory] = useState('general');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);

  const handleAddTag = (e) => {
    e.preventDefault();
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    
    console.log('Form State Values:', {
      sessionId,
      rating,
      feedback,
      category,
      tags
    });

    if (!sessionId) {
      setFeedbackError('Session not initialized. Please try again.');
      return;
    }

    if (!feedback || feedback.trim() === '') {
      setFeedbackError('Please enter your feedback.');
      return;
    }

    setSubmitting(true);
    setFeedbackError(null);

    try {
      // Create the feedback data object
      const feedbackData = {
        sessionId: sessionId,
        comment: feedback.trim(),
        category: category || 'general',
        tags: tags || [],
        status: 'new'
      };

      // Only add rating if it's a valid number between 1-5
      if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
        feedbackData.rating = rating;
      }

      console.log('Submitting feedback data:', feedbackData);

      const response = await fetch(apiUrl('/api/feedback'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(feedbackData)
      });

      const responseData = await response.json();
      console.log('Server response:', responseData);

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to submit feedback');
      }

      // Clear form only after successful submission
      setRating(null);
      setFeedback('');
      setCategory('general');
      setTags([]);
      setShowFeedbackForm(false);
      alert('Thank you for your feedback!');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setFeedbackError(error.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="landing">
        <div className="landing-content">
          {/* ... existing landing page content ... */}
        </div>
      </div>

      <button 
        className="feedback-button"
        onClick={() => setShowFeedbackForm(true)}
      >
        Give Feedback
      </button>

      {showFeedbackForm && (
        <div className="modal-overlay" onClick={() => setShowFeedbackForm(false)}>
          <div className="feedback-dialog" onClick={e => e.stopPropagation()}>
            <div className="feedback-dialog-header">
              <h3>Website Feedback</h3>
              <button 
                className="close-button"
                onClick={() => setShowFeedbackForm(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleFeedbackSubmit} className="feedback-form">
              <div className="rating-container">
                <label>Rating (optional):</label>
                <div className="star-rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`star ${star <= (rating || 0) ? 'filled' : ''}`}
                      onClick={() => setRating(star)}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <div className="category-container">
                <label htmlFor="category">Category:</label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={submitting}
                >
                  <option value="general">General</option>
                  <option value="bug">Bug Report</option>
                  <option value="feature_request">Feature Request</option>
                  <option value="ui_ux">UI/UX</option>
                  <option value="performance">Performance</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="feedback-input">
                <label htmlFor="feedback">Comments:</label>
                <textarea
                  id="feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Tell us what you think... (max 1000 characters)"
                  maxLength={1000}
                  rows="4"
                  disabled={submitting}
                  required
                />
              </div>

              <div className="tags-container">
                <label>Tags (optional):</label>
                <div className="tags-input">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Add a tag..."
                    disabled={submitting}
                  />
                  <button 
                    type="button" 
                    onClick={handleAddTag}
                    disabled={submitting || !newTag.trim()}
                  >
                    Add
                  </button>
                </div>
                <div className="tags-list">
                  {tags.map((tag, index) => (
                    <span key={index} className="tag">
                      {tag}
                      <button 
                        type="button" 
                        onClick={() => handleRemoveTag(tag)}
                        className="remove-tag"
                        disabled={submitting}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {feedbackError && (
                <div className="feedback-error">
                  {feedbackError}
                </div>
              )}

              <div className="feedback-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => setShowFeedbackForm(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="submit-button"
                  disabled={submitting}
                >
                  {submitting ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default Landing;