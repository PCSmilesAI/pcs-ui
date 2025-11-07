/**
 * CSRF-Protected Form Component
 * 
 * Automatically includes CSRF token in form submissions
 * Usage:
 *   <CSRFForm onSubmit={handleSubmit}>
 *     <input type="text" name="field" />
 *     <button type="submit">Submit</button>
 *   </CSRFForm>
 */

import React, { FormEvent, ReactNode } from 'react';
import { useCSRFToken } from '../hooks/useCSRFToken';

interface CSRFFormProps {
  onSubmit: (formData: FormData, csrfToken: string | null) => void | Promise<void>;
  children: ReactNode;
  className?: string;
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
}

/**
 * Form component that automatically includes CSRF token
 */
export function CSRFForm({
  onSubmit,
  children,
  className = '',
  method = 'POST',
}: CSRFFormProps) {
  const csrfToken = useCSRFToken();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    
    try {
      await onSubmit(formData, csrfToken);
    } catch (error) {
      console.error('Form submission error:', error);
      throw error;
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className} method={method}>
      {children}
      {/* Hidden CSRF token field for traditional form submissions */}
      {csrfToken && (
        <input type="hidden" name="csrf_token" value={csrfToken} />
      )}
    </form>
  );
}

/**
 * Hook to get CSRF token for manual form handling
 */
export function useFormCSRFToken() {
  return useCSRFToken();
}

/**
 * Helper to convert FormData to JSON with CSRF token
 */
export function formDataToJSON(
  formData: FormData,
  csrfToken: string | null
): Record<string, any> {
  const data: Record<string, any> = {};
  
  formData.forEach((value, key) => {
    if (key === 'csrf_token') return; // Skip CSRF token field
    
    if (data[key]) {
      // Handle multiple values for same key
      if (Array.isArray(data[key])) {
        data[key].push(value);
      } else {
        data[key] = [data[key], value];
      }
    } else {
      data[key] = value;
    }
  });

  return data;
}

