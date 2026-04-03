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
      let detail = text;
      try {
        const errJson = JSON.parse(text);
        if (
          errJson.error === 'not_connected' ||
          (typeof errJson.detail === 'string' && errJson.detail.includes('No realm'))
        ) {
          detail =
            'QuickBooks is not connected on the server. An admin should open Connections (or /ConnectionsPage) and connect QuickBooks.';
        } else if (errJson.error === 'refresh_failed') {
          detail =
            'QuickBooks login expired. An admin must reconnect QuickBooks (Connections page or /api/qbo/auth).';
        } else if (errJson.error === 'qbo_query_failed') {
          detail = `QuickBooks API error (HTTP ${errJson.status || res.status}). Try again or reconnect QuickBooks.`;
        } else if (typeof errJson.error === 'string') {
          detail = errJson.detail ? `${errJson.error}: ${errJson.detail}` : errJson.error;
        }
      } catch {
        /* keep raw text */
      }
      throw new Error(`HTTP ${res.status}: ${detail}`);
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
