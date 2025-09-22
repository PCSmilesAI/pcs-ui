'use client';
import React, { createContext, useContext, useState } from 'react';

const SearchContext = createContext();

export function SearchProvider({ children }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({});

  const updateSearch = (query) => {
    console.log('🔍 SearchContext: Updating search query to:', query);
    setSearchQuery(query);
  };

  const updateFilters = (newFilters) => {
    console.log('🔍 SearchContext: Updating filters to:', newFilters);
    setFilters(newFilters);
  };

  return (
    <SearchContext.Provider value={{
      searchQuery,
      filters,
      updateSearch,
      updateFilters
    }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
}
