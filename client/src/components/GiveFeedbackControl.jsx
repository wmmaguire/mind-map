import { useState, useEffect, useRef, useCallback } from 'react';
import './GiveFeedbackControl.css';
import { apiRequest, getApiErrorMessage } from '../api/http';
import { useSession } from '../context/SessionContext';

/**
 * App-shell feedback: FAB + modal, mounted once (GitHub #23).
 * Safe-area insets, Escape to close, focus return to FAB.
 */
function GiveFeedbackControl() {
  const { sessionId } = useSession();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [category, setCategory] = useState('general');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);
  const [thanks, setThanks] = useState(false);

  const fabRef = useRef(null);
  const closeButtonRef = useRef(null);

  const resetForm = useCallback(() => {
    setRating(null);
    setFeedback('');
    setCategory('general');
    setTags([]);
    setNewTag('');
    setFeedbackError(null);
    setThanks(false);
  }, []);

  const closeModal = useCallback(() => {
    setOpen(false);
    resetForm();
    requestAnimationFrame(() => {
      fabRef.current?.focus();
    });
  }, [resetForm]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, closeModal]);

  useEffect(() => {
    if (open && !thanks) {
      closeButtonRef.current?.focus();
    }
  }, [open, thanks]);

  const handleAddTag = (e) => {
    e.preventDefault();
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();

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
      const feedbackData = {
        sessionId,
        comment: feedback.trim(),
        category: category || 'general',
        tags: tags || [],
        status: 'new',
      };

      if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
        feedbackData.rating = rating;
      }

      await apiRequest('/api/feedback', {
        method: 'POST',
        json: feedbackData,
      });

      setThanks(true);
      setTimeout(() => {
        setOpen(false);
        resetForm();
        requestAnimationFrame(() => {
          fabRef.current?.focus();
        });
      }, 1800);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setFeedbackError(
        getApiErrorMessage(error) || 'Failed to submit feedback. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        ref={fabRef}
        className="give-feedback-fab"
        onClick={() => setOpen(true)}
        aria-label="Give feedback"
        aria-expanded={open}
        aria-controls="give-feedback-dialog"
        aria-haspopup="dialog"
      >
        <span className="give-feedback-fab__icon" aria-hidden="true">
          💬
        </span>
        <span className="give-feedback-fab__label">Feedback</span>
      </button>

      {open && (
        <div
          className="give-feedback-overlay"
          role="presentation"
          onClick={closeModal}
        >
          <div
            id="give-feedback-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="give-feedback-dialog-title"
            className="give-feedback-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            {thanks ? (
              <div className="give-feedback-thanks" role="status">
                <p>Thank you for your feedback!</p>
              </div>
            ) : (
              <>
                <div className="give-feedback-dialog-header">
                  <h3 id="give-feedback-dialog-title">Website feedback</h3>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    className="give-feedback-close"
                    onClick={closeModal}
                    aria-label="Close feedback form"
                  >
                    ×
                  </button>
                </div>

                <form onSubmit={handleFeedbackSubmit} className="give-feedback-form">
                  <div className="rating-container">
                    <span id="rating-label">Rating (optional)</span>
                    <div
                      className="star-rating"
                      role="group"
                      aria-labelledby="rating-label"
                    >
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          className={`star ${star <= (rating || 0) ? 'filled' : ''}`}
                          onClick={() => setRating(star)}
                          aria-label={`${star} star${star === 1 ? '' : 's'}`}
                          aria-pressed={rating != null && star <= rating}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="category-container">
                    <label htmlFor="feedback-category">Category</label>
                    <select
                      id="feedback-category"
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
                    <label htmlFor="feedback-comments">Comments</label>
                    <textarea
                      id="feedback-comments"
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Tell us what you think… (max 1000 characters)"
                      maxLength={1000}
                      rows={4}
                      disabled={submitting}
                      required
                    />
                  </div>

                  <div className="tags-container">
                    <span id="tags-label">Tags (optional)</span>
                    <div className="tags-input">
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="Add a tag…"
                        disabled={submitting}
                        aria-labelledby="tags-label"
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
                      {tags.map((tag) => (
                        <span key={tag} className="tag">
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="remove-tag"
                            disabled={submitting}
                            aria-label={`Remove tag ${tag}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {feedbackError && (
                    <div className="feedback-error" role="alert">
                      {feedbackError}
                    </div>
                  )}

                  <div className="feedback-actions">
                    <button
                      type="button"
                      className="cancel-button"
                      onClick={closeModal}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="submit-button"
                      disabled={submitting}
                    >
                      {submitting ? 'Submitting…' : 'Submit feedback'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default GiveFeedbackControl;
