import React, { useState, useEffect, useCallback } from 'react';
import quickbooksAPI from '../utils/quickbooksApi';

/**
 * QuickBooks Integration Component
 * Provides interface for QuickBooks API operations in PCS AI
 */
const QuickBooksIntegration = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle');

  // Check if QuickBooks is connected
  const loadQuickBooksData = useCallback(async () => {
    try {
      setLoading(true);

      // Load account categories
      const accountCategories = await quickbooksAPI.getAccountCategories();
      setCategories(accountCategories);

      console.log(`✅ Loaded ${accountCategories.length} QuickBooks categories`);
    } catch (error) {
      console.error('❌ Failed to load QuickBooks data:', error);
      setError('Failed to load QuickBooks data');
    } finally {
      setLoading(false);
    }
  }, []);

  const checkConnectionStatus = useCallback(async () => {
    try {
      setLoading(true);
      const isValid = await quickbooksAPI.validateToken();
      setIsConnected(isValid);

      if (isValid) {
        // Load initial data
        await loadQuickBooksData();
      }
    } catch (error) {
      console.error('❌ Connection check failed:', error);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, [loadQuickBooksData]);

  // Check connection status on component mount
  useEffect(() => {
    checkConnectionStatus();
  }, [checkConnectionStatus]);

  // Sync categories from QuickBooks to PCS AI
  const syncCategories = async () => {
    try {
      setSyncStatus('syncing');
      setError(null);
      
      console.log('🔄 Starting category sync...');
      
      // Get fresh categories from QuickBooks
      const freshCategories = await quickbooksAPI.getAccountCategories();
      
      // Update local state
      setCategories(freshCategories);
      
      // Save to PCS AI storage (you can customize this)
      await saveCategoriesToPCS(freshCategories);
      
      setSyncStatus('completed');
      console.log(`✅ Category sync completed: ${freshCategories.length} categories`);
      
    } catch (error) {
      console.error('❌ Category sync failed:', error);
      setError('Category sync failed: ' + error.message);
      setSyncStatus('failed');
    }
  };

  // Save categories to PCS AI storage
  const saveCategoriesToPCS = async (categories) => {
    try {
      // Create a mapping file for PCS AI to use
      const categoryMapping = categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        type: cat.type,
        classification: cat.classification,
        fullyQualifiedName: cat.fullyQualifiedName
      }));

      // Save to public directory (temporary solution)
      const response = await fetch('/api/save-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: categoryMapping })
      });

      if (!response.ok) {
        throw new Error('Failed to save categories to PCS AI');
      }

      console.log('💾 Categories saved to PCS AI successfully');
    } catch (error) {
      console.error('❌ Failed to save categories to PCS AI:', error);
      // Don't fail the whole sync if saving fails
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading QuickBooks integration...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          🔗 QuickBooks Integration
        </h2>

        {/* Connection Status */}
        <div className={`p-4 rounded-2xl mb-6 ${
          isConnected ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-3 ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className={`font-medium ${
              isConnected ? 'text-green-800' : 'text-red-800'
            }`}>
              {isConnected ? 'Connected to QuickBooks' : 'Not connected to QuickBooks'}
            </span>
          </div>
          {!isConnected && (
            <p className="text-red-700 mt-2 text-sm">
              Complete the OAuth flow to connect to QuickBooks and enable API features.
            </p>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* QuickBooks Data */}
        {isConnected && (
          <div className="space-y-6">
            {/* Categories Section */}
            <div className="border border-gray-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  📊 Account Categories ({categories.length})
                </h3>
                <button
                  onClick={syncCategories}
                  disabled={syncStatus === 'syncing'}
                  className="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50"
                >
                  {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Categories'}
                </button>
              </div>
              
              {syncStatus === 'completed' && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-3 mb-4">
                  <p className="text-green-800 text-sm">✅ Categories synced successfully!</p>
                </div>
              )}
              
              {syncStatus === 'failed' && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-3 mb-4">
                  <p className="text-red-800 text-sm">❌ Category sync failed</p>
                </div>
              )}

              <div className="max-h-60 overflow-y-auto">
                {categories.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {categories.map(category => (
                      <div key={category.id} className="bg-gray-50 p-3 rounded border">
                        <div className="font-medium text-gray-900">{category.name}</div>
                        <div className="text-sm text-gray-600">
                          Type: {category.type} | ID: {category.id}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No categories loaded</p>
                )}
              </div>
            </div>

            {/* Integration Actions */}
            <div className="border border-gray-200 rounded-2xl p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                🚀 Integration Actions
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                  <div>
                    <h4 className="font-medium text-gray-900">Category Mapping</h4>
                    <p className="text-sm text-gray-600">
                      Apply QuickBooks categories to PCS AI invoices
                    </p>
                  </div>
                  <span className="text-green-600 text-sm font-medium">Ready</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                  <div>
                    <h4 className="font-medium text-gray-900">Invoice Sync</h4>
                    <p className="text-sm text-gray-600">
                      Send completed invoices to QuickBooks as bills
                    </p>
                  </div>
                  <span className="text-green-600 text-sm font-medium">Ready</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl">
                  <div>
                    <h4 className="font-medium text-gray-900">PDF Attachments</h4>
                    <p className="text-sm text-gray-600">
                      Automatically attach invoice PDFs to QuickBooks bills
                    </p>
                  </div>
                  <span className="text-green-600 text-sm font-medium">Ready</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Connection Instructions */}
        {!isConnected && (
          <div className="border border-gray-200 rounded-2xl p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              🔐 Connect to QuickBooks
            </h3>
            <p className="text-gray-600 mb-4">
              To enable QuickBooks integration, you need to complete the OAuth authorization flow.
            </p>
            <a
              href="/api/qbo/connect"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 font-medium"
            >
              🔗 Connect to QuickBooks
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickBooksIntegration;
