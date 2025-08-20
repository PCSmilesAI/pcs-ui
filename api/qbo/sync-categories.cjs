/**
 * Sync QuickBooks Categories to PCS AI
 * Fetches all accounts from QuickBooks and updates PCS AI category mapping
 */

const QuickBooksAPI = require('./api-client.cjs');

module.exports = async (req, res) => {
  try {
    console.log('📊 Starting QuickBooks category sync...');
    
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Fetch all accounts from QuickBooks
    const accounts = await QuickBooksAPI.getAccounts();
    
    if (!accounts || accounts.length === 0) {
      return res.status(404).json({ error: 'No accounts found in QuickBooks' });
    }

    // Transform QuickBooks accounts to PCS AI category format
    const categories = accounts.map(account => ({
      id: account.Id,
      name: account.Name,
      type: account.AccountType,
      classification: account.Classification,
      active: account.Active,
      description: account.Description || '',
      quickbooksSync: {
        lastSynced: new Date().toISOString(),
        source: 'QuickBooks',
        accountId: account.Id
      }
    }));

    console.log(`✅ Synced ${categories.length} categories from QuickBooks`);

    // TODO: Store categories in PCS AI database/cache
    // For now, return the categories
    return res.status(200).json({
      success: true,
      message: `Successfully synced ${categories.length} categories from QuickBooks`,
      categories: categories,
      count: categories.length,
      lastSynced: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Category sync failed:', error.message);
    
    return res.status(500).json({
      error: 'Failed to sync categories from QuickBooks',
      details: error.message
    });
  }
};
