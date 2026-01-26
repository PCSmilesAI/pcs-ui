import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Searchable/Autocomplete Select Component
 * - Type to filter options
 * - Shows autocomplete suggestion inline
 * - Enter/Tab to select suggestion
 * - Click dropdown items to select
 */
export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Type to search...',
  displayKey = 'name',
  valueKey = 'id',
  getDisplayText = null,
  disabled = false,
  style = {},
  initialDisplayValue = '', // Fallback display text when value doesn't match any option
}) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Get display text for an option
  const getOptionDisplay = useCallback((option) => {
    if (getDisplayText) return getDisplayText(option);
    return option?.displayText || option?.fullName || option?.[displayKey] || '';
  }, [getDisplayText, displayKey]);

  // Find selected option and set input value
  useEffect(() => {
    if (value) {
      const selected = options.find(opt => opt[valueKey] === value);
      if (selected) {
        setInputValue(getOptionDisplay(selected));
      } else if (initialDisplayValue) {
        // Fallback to provided display value when no option matches
        // This is useful when editing saved data where the ID might not match current options
        setInputValue(initialDisplayValue);
      }
    } else if (initialDisplayValue) {
      // If no value but initialDisplayValue provided, show it
      setInputValue(initialDisplayValue);
    } else {
      setInputValue('');
    }
  }, [value, options, valueKey, getOptionDisplay, initialDisplayValue]);

  // Filter options based on input
  const filteredOptions = inputValue
    ? options.filter(opt => {
        const display = getOptionDisplay(opt).toLowerCase();
        const search = inputValue.toLowerCase();
        return display.includes(search);
      })
    : options;

  // Get autocomplete suggestion (first matching option that starts with input)
  const getSuggestion = useCallback(() => {
    if (!inputValue || !isOpen) return '';
    const match = options.find(opt => {
      const display = getOptionDisplay(opt).toLowerCase();
      return display.startsWith(inputValue.toLowerCase());
    });
    if (match) {
      const display = getOptionDisplay(match);
      return display;
    }
    return '';
  }, [inputValue, isOpen, options, getOptionDisplay]);

  const suggestion = getSuggestion();

  // Handle input change
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsOpen(true);
    setHighlightIndex(0);
    
    // If input is cleared, clear the selection
    if (!newValue) {
      onChange('', '');
    }
  };

  // Handle option selection
  const selectOption = useCallback((option) => {
    const displayText = getOptionDisplay(option);
    setInputValue(displayText);
    onChange(option[valueKey], displayText);
    setIsOpen(false);
  }, [onChange, valueKey, getOptionDisplay]);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
      return;
    }

    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, filteredOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (isOpen && filteredOptions.length > 0) {
        e.preventDefault();
        selectOption(filteredOptions[highlightIndex]);
      } else if (suggestion && (e.key === 'Tab' || e.key === 'Enter')) {
        // Accept the autocomplete suggestion
        e.preventDefault();
        const match = options.find(opt => 
          getOptionDisplay(opt).toLowerCase() === suggestion.toLowerCase()
        );
        if (match) {
          selectOption(match);
        }
      }
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        setIsOpen(false);
        // If input doesn't match any option, revert to selected value or initialDisplayValue
        if (value) {
          const selected = options.find(opt => opt[valueKey] === value);
          if (selected) {
            setInputValue(getOptionDisplay(selected));
          } else if (initialDisplayValue) {
            setInputValue(initialDisplayValue);
          }
        } else if (initialDisplayValue) {
          setInputValue(initialDisplayValue);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value, options, valueKey, getOptionDisplay, initialDisplayValue]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const highlighted = dropdownRef.current.querySelector(`[data-index="${highlightIndex}"]`);
      if (highlighted) {
        highlighted.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightIndex, isOpen]);

  const containerStyle = {
    position: 'relative',
    width: '100%',
    ...style,
  };

  const inputContainerStyle = {
    position: 'relative',
    width: '100%',
  };

  const inputStyle = {
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid #cbd5e0',
    fontSize: '14px',
    backgroundColor: disabled ? '#f3f4f6' : '#ffffff',
    cursor: disabled ? 'not-allowed' : 'text',
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  };

  const suggestionStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid transparent',
    fontSize: '14px',
    color: '#9ca3af',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    boxSizing: 'border-box',
  };

  const dropdownStyle = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    maxHeight: '250px',
    overflowY: 'auto',
    backgroundColor: '#ffffff',
    border: '1px solid #cbd5e0',
    borderRadius: '4px',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
    zIndex: 1000,
    marginTop: '4px',
  };

  const optionStyle = (isHighlighted) => ({
    padding: '10px 12px',
    cursor: 'pointer',
    backgroundColor: isHighlighted ? '#dbeafe' : '#ffffff',
    fontSize: '14px',
    borderBottom: '1px solid #f3f4f6',
    transition: 'background-color 0.1s',
  });

  const noResultsStyle = {
    padding: '10px 12px',
    color: '#9ca3af',
    fontSize: '14px',
    textAlign: 'center',
  };

  return (
    <div style={containerStyle}>
      <div style={inputContainerStyle}>
        {/* Autocomplete suggestion (shown behind input) */}
        {suggestion && inputValue && (
          <div style={suggestionStyle}>
            {inputValue}
            <span style={{ color: '#9ca3af' }}>
              {suggestion.slice(inputValue.length)}
            </span>
          </div>
        )}
        
        {/* Main input */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            ...inputStyle,
            backgroundColor: suggestion && inputValue ? 'transparent' : (disabled ? '#f3f4f6' : '#ffffff'),
          }}
          autoComplete="off"
        />
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div ref={dropdownRef} style={dropdownStyle}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, idx) => (
              <div
                key={option[valueKey] || idx}
                data-index={idx}
                style={optionStyle(idx === highlightIndex)}
                onClick={() => selectOption(option)}
                onMouseEnter={() => setHighlightIndex(idx)}
              >
                {getOptionDisplay(option)}
              </div>
            ))
          ) : (
            <div style={noResultsStyle}>No matches found</div>
          )}
        </div>
      )}
    </div>
  );
}

