'use client';

import React, { useState, useEffect } from 'react';
import { useConsoleCapture } from '../hooks/useConsoleCapture';

interface FeedbackButtonProps {
  // Optional props for customization
  position?: 'bottom-right' | 'bottom-left';
}

type FeedbackType = 'bug' | 'feature';

export default function FeedbackButton({ position = 'bottom-right' }: FeedbackButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<FeedbackType>('bug');
  const [message, setMessage] = useState('');
  const [featureRequest, setFeatureRequest] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const { getLogsFormatted, logCount } = useConsoleCapture();

  // Reset status after showing result
  useEffect(() => {
    if (submitStatus !== 'idle') {
      const timer = setTimeout(() => {
        if (submitStatus === 'success') {
          setIsOpen(false);
          setMessage('');
          setFeatureRequest('');
        }
        setSubmitStatus('idle');
        setErrorMessage('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [submitStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const currentMessage = activeTab === 'bug' ? message : featureRequest;
    
    if (!currentMessage.trim()) {
      setErrorMessage(activeTab === 'bug' ? 'Please describe the issue' : 'Please describe your feature request');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const payload = {
        type: activeTab,
        message: currentMessage.trim(),
        url: window.location.href,
        consoleLogs: activeTab === 'bug' ? getLogsFormatted() : '',
        logCount: activeTab === 'bug' ? logCount : 0,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
      };

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send feedback');
      }

      setSubmitStatus('success');
    } catch (err) {
      setSubmitStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const positionStyles = position === 'bottom-right' 
    ? { right: '20px', bottom: '20px' }
    : { left: '20px', bottom: '20px' };

  const tabStyle = (isActive: boolean) => ({
    flex: 1,
    padding: '10px 16px',
    border: 'none',
    background: isActive ? 'white' : 'transparent',
    color: isActive ? '#357ab2' : 'rgba(255,255,255,0.8)',
    fontWeight: isActive ? 600 : 400,
    fontSize: '14px',
    cursor: 'pointer',
    borderRadius: isActive ? '8px 8px 0 0' : '0',
    marginTop: isActive ? '0' : '4px',
    transition: 'all 0.2s',
  });

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          ...positionStyles,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: '#357ab2',
          border: 'none',
          boxShadow: '0 4px 15px rgba(53, 122, 178, 0.4)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s, box-shadow 0.2s',
          zIndex: 9998,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(53, 122, 178, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 15px rgba(53, 122, 178, 0.4)';
        }}
        title="Send Feedback"
        aria-label="Open feedback form"
      >
        {/* Feedback Icon (Chat bubble with exclamation) */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <line x1="12" y1="8" x2="12" y2="11" />
          <circle cx="12" cy="14" r="0.5" fill="white" />
        </svg>
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          {/* Modal Content */}
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
            }}
          >
            {/* Header with Tabs */}
            <div
              style={{
                background: '#357ab2',
                padding: '16px 24px 0 24px',
              }}
            >
              {/* Title row with close button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, color: 'white', fontSize: '20px', fontWeight: 600 }}>
                  Send Feedback
                </h2>
                <button
                  onClick={() => setIsOpen(false)}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '18px',
                  }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              
              {/* Tabs */}
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('bug')}
                  style={tabStyle(activeTab === 'bug')}
                >
                  Developer Feedback
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('feature')}
                  style={tabStyle(activeTab === 'feature')}
                >
                  Feature Request
                </button>
              </div>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
              {/* Success Message */}
              {submitStatus === 'success' && (
                <div
                  style={{
                    backgroundColor: '#d4edda',
                    color: '#155724',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                  }}
                >
                  {activeTab === 'bug' 
                    ? 'Feedback sent! Thank you for helping improve the app.'
                    : 'Feature request sent! Thank you for your suggestion.'}
                </div>
              )}

              {/* Error Message */}
              {(submitStatus === 'error' || errorMessage) && (
                <div
                  style={{
                    backgroundColor: '#f8d7da',
                    color: '#721c24',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                  }}
                >
                  {errorMessage || 'Something went wrong. Please try again.'}
                </div>
              )}

              {/* Bug Report Tab Content */}
              {activeTab === 'bug' && (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label
                      htmlFor="feedback-message"
                      style={{
                        display: 'block',
                        marginBottom: '8px',
                        fontWeight: 500,
                        color: '#374151',
                      }}
                    >
                      What went wrong? <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <textarea
                      id="feedback-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Describe the bug or issue you encountered..."
                      required
                      style={{
                        width: '100%',
                        minHeight: '120px',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '2px solid #e5e7eb',
                        fontSize: '14px',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                        transition: 'border-color 0.2s',
                        boxSizing: 'border-box',
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#357ab2';
                        e.target.style.outline = 'none';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e5e7eb';
                      }}
                    />
                  </div>

                  {/* Console log indicator */}
                  <div
                    style={{
                      backgroundColor: '#f3f4f6',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      marginBottom: '20px',
                      fontSize: '13px',
                      color: '#6b7280',
                    }}
                  >
                    {logCount > 0
                      ? `${logCount} console log${logCount === 1 ? '' : 's'} will be included automatically`
                      : 'Console logs will be included automatically'}
                  </div>

                  {/* Current page indicator */}
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#9ca3af',
                      marginBottom: '20px',
                      wordBreak: 'break-all',
                    }}
                  >
                    Page: {typeof window !== 'undefined' ? window.location.pathname : ''}
                  </div>
                </>
              )}

              {/* Feature Request Tab Content */}
              {activeTab === 'feature' && (
                <div style={{ marginBottom: '20px' }}>
                  <label
                    htmlFor="feature-request"
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontWeight: 500,
                      color: '#374151',
                    }}
                  >
                    Describe your feature request <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <textarea
                    id="feature-request"
                    value={featureRequest}
                    onChange={(e) => setFeatureRequest(e.target.value)}
                    placeholder="What feature would you like to see added? Please be as detailed as possible..."
                    required
                    style={{
                      width: '100%',
                      minHeight: '150px',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '2px solid #e5e7eb',
                      fontSize: '14px',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#357ab2';
                      e.target.style.outline = 'none';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e5e7eb';
                    }}
                  />
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || submitStatus === 'success'}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  background: isSubmitting || submitStatus === 'success'
                    ? '#9ca3af'
                    : '#357ab2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: isSubmitting || submitStatus === 'success' ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s',
                }}
              >
                {isSubmitting ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid white',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                    Sending...
                  </span>
                ) : submitStatus === 'success' ? (
                  'Sent!'
                ) : activeTab === 'bug' ? (
                  'Send Feedback'
                ) : (
                  'Send Feature Request'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
