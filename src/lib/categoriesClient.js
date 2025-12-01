/**
 * Client-side helper to fetch QuickBooks categories from our server API
 * This replaces direct calls to QuickBooks API from the browser
 */
export async function fetchQboCategories() {
  try {
    const res = await fetch('/api/qbo/categories', { 
      method: 'GET',
      cache: 'no-store' // Ensure fresh data
    });
    
    const text = await res.text(); // Read as text first to avoid JSON parse errors
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    
    // Parse JSON safely
    let data;
    try { 
      data = JSON.parse(text); 
    } catch (parseError) {
      throw new Error(`Invalid JSON response: ${text}`);
    }
    
    // Extract categories from our API response format (exact QBO names)
    const categories = data?.categories ?? data?.payload?.categories ?? [];
    
    if (!Array.isArray(categories)) {
      throw new Error(`Invalid categories format: ${JSON.stringify(categories)}`);
    }
    
    return {
      categories,
      source: data?.payload?.source || data?.source || 'unknown',
      reason: data?.payload?.reason || data?.reason || ''
    };
    
  } catch (error) {
    console.error('❌ fetchQboCategories error:', error);
    throw new Error(`Failed to load QuickBooks categories: ${error.message || error.toString() || 'Unknown error'}`);
  }
}
