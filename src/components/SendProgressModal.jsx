import React, { useState, useEffect } from 'react';

/**
 * SendProgressModal - Animated modal for the "Send" action
 * Shows a two-step progress animation:
 * 1. "Updating PCS AI" with spinning gear -> checkmark
 * 2. "Sending for Approval" with spinning gear -> checkmark
 * Then auto-dismisses after 1 second
 */
export default function SendProgressModal({ 
  isOpen, 
  onClose, 
  onComplete,
  step1Status = 'idle', // 'idle' | 'processing' | 'complete' | 'error'
  step2Status = 'idle', // 'idle' | 'processing' | 'complete' | 'error'
  step1Error = null,
  step2Error = null,
}) {
  const [shouldAutoDismiss, setShouldAutoDismiss] = useState(false);

  // Auto-dismiss after both steps complete
  useEffect(() => {
    if (step1Status === 'complete' && step2Status === 'complete' && !shouldAutoDismiss) {
      setShouldAutoDismiss(true);
      const timer = setTimeout(() => {
        onComplete?.();
        onClose?.();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [step1Status, step2Status, shouldAutoDismiss, onComplete, onClose]);

  if (!isOpen) return null;

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const modalStyle = {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '32px 48px',
    maxWidth: '400px',
    width: '90%',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  };

  const stepContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px 0',
    borderBottom: '1px solid #e5e7eb',
  };

  const lastStepContainerStyle = {
    ...stepContainerStyle,
    borderBottom: 'none',
  };

  const iconContainerStyle = {
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };

  const spinnerStyle = {
    width: '32px',
    height: '32px',
    border: '3px solid #e5e7eb',
    borderTopColor: '#357ab2',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  };

  const checkmarkStyle = {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#059669',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'popIn 0.3s ease-out',
  };

  const pendingCircleStyle = {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '3px solid #e5e7eb',
  };

  const errorCircleStyle = {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#dc2626',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const labelStyle = (status) => ({
    fontSize: '16px',
    fontWeight: status === 'processing' ? 600 : 500,
    color: status === 'complete' ? '#059669' : status === 'error' ? '#dc2626' : status === 'processing' ? '#111827' : '#9ca3af',
    transition: 'color 0.3s ease',
  });

  const renderIcon = (status) => {
    if (status === 'processing') {
      return <div style={spinnerStyle} />;
    }
    if (status === 'complete') {
      return (
        <div style={checkmarkStyle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      );
    }
    if (status === 'error') {
      return (
        <div style={errorCircleStyle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      );
    }
    return <div style={pendingCircleStyle} />;
  };

  return (
    <div style={overlayStyle}>
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          @keyframes popIn {
            0% { transform: scale(0); }
            70% { transform: scale(1.1); }
            100% { transform: scale(1); }
          }
        `}
      </style>
      <div style={modalStyle}>
        <h2 style={{ 
          fontSize: '20px', 
          fontWeight: 600, 
          color: '#111827', 
          marginBottom: '8px',
          textAlign: 'center',
        }}>
          Processing Invoice
        </h2>
        <p style={{ 
          color: '#6b7280', 
          fontSize: '14px', 
          marginBottom: '24px',
          textAlign: 'center',
        }}>
          Please wait while we process your request
        </p>

        {/* Step 1: Updating PCS AI */}
        <div style={stepContainerStyle}>
          <div style={iconContainerStyle}>
            {renderIcon(step1Status)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle(step1Status)}>Updating PCS AI</div>
            {step1Error && (
              <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>
                {step1Error}
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Sending for Approval */}
        <div style={lastStepContainerStyle}>
          <div style={iconContainerStyle}>
            {renderIcon(step2Status)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle(step2Status)}>Sending for Approval</div>
            {step2Error && (
              <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>
                {step2Error}
              </div>
            )}
          </div>
        </div>

        {/* Success message when both complete */}
        {step1Status === 'complete' && step2Status === 'complete' && (
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            backgroundColor: '#d1fae5',
            borderRadius: '12px',
            textAlign: 'center',
          }}>
            <span style={{ color: '#059669', fontWeight: 600 }}>
              Invoice sent successfully!
            </span>
          </div>
        )}

        {/* Error state - show close button */}
        {(step1Status === 'error' || step2Status === 'error') && (
          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <button
              onClick={onClose}
              style={{
                padding: '10px 24px',
                backgroundColor: '#357ab2',
                color: '#fff',
                borderRadius: '9999px',
                border: 'none',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
