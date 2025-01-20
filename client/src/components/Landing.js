// ... previous imports ...
import { useState } from 'react';
import './Landing.css';

function Landing() {
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);

  const getBaseUrl = () => {
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:5001/api';
    }
    // In production, use the full domain with /api
    return 'https://talk-graph.onrender.com/api';
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedbackError(null);

    try {
      const baseUrl = getBaseUrl();
      const fullUrl = `${baseUrl}/feedback`;
      
      console.log('Submitting feedback to:', fullUrl); // Debug log
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rating,
          feedback
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit feedback');
      }

      const data = await response.json();
      console.log('Feedback response:', data); // Debug log

      setRating(5);
      setFeedback('');
      setShowFeedbackForm(false);
      alert('Thank you for your feedback!');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setFeedbackError('Failed to submit feedback. Please try again.');
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
                <label>Rating:</label>
                <div className="star-rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`star ${star <= rating ? 'filled' : ''}`}
                      onClick={() => setRating(star)}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <div className="feedback-input">
                <label htmlFor="feedback">Comments:</label>
                <textarea
                  id="feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Tell us what you think..."
                  rows="4"
                  disabled={submitting}
                />
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