// src/lib/categorize.ts
export interface LineItem {
  description: string;
  vendor: string;
  qty?: number;
  unit?: number;
  total?: number;
}

export interface Category {
  id: string;
  name: string;
  type: string;
}

export interface CategorizationResult {
  index: number;
  categoryId?: string;
  categoryName?: string;
  confidence: number;
  source: string;
}

export function categorizeInvoiceLines(
  lines: LineItem[],
  vendor: string,
  categories: Category[]
): CategorizationResult[] {
  const results: CategorizationResult[] = [];
  
  // Simple categorization logic based on keywords
  const keywordMap: Record<string, string[]> = {
    'supplies': ['supply', 'material', 'equipment', 'tool', 'instrument'],
    'office': ['office', 'admin', 'administrative', 'supply'],
    'medical': ['medical', 'dental', 'clinical', 'patient', 'treatment'],
    'utilities': ['electric', 'water', 'gas', 'utility', 'power'],
    'rent': ['rent', 'lease', 'rental', 'space'],
    'insurance': ['insurance', 'liability', 'coverage'],
    'marketing': ['marketing', 'advertising', 'promotion', 'brand'],
    'software': ['software', 'license', 'subscription', 'saas'],
    'maintenance': ['maintenance', 'repair', 'service', 'upkeep'],
    'professional': ['legal', 'accounting', 'consulting', 'professional']
  };
  
  lines.forEach((line, index) => {
    const description = line.description.toLowerCase();
    const vendorLower = vendor.toLowerCase();
    
    let bestMatch = '';
    let bestConfidence = 0;
    let bestCategoryId = '';
    let bestCategoryName = '';
    
    // Try to match by description keywords
    for (const [category, keywords] of Object.entries(keywordMap)) {
      for (const keyword of keywords) {
        if (description.includes(keyword)) {
          const confidence = keyword.length / description.length;
          if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestMatch = category;
          }
        }
      }
    }
    
    // Try to match by vendor name patterns
    if (bestConfidence < 0.3) {
      for (const [category, keywords] of Object.entries(keywordMap)) {
        for (const keyword of keywords) {
          if (vendorLower.includes(keyword)) {
            const confidence = 0.4; // Lower confidence for vendor-based matching
            if (confidence > bestConfidence) {
              bestConfidence = confidence;
              bestMatch = category;
            }
          }
        }
      }
    }
    
    // Find the actual category ID and name
    if (bestMatch) {
      const category = categories.find(cat => 
        cat.name.toLowerCase().includes(bestMatch) || 
        bestMatch.includes(cat.name.toLowerCase())
      );
      
      if (category) {
        bestCategoryId = category.id;
        bestCategoryName = category.name;
      }
    }
    
    results.push({
      index,
      categoryId: bestCategoryId || undefined,
      categoryName: bestCategoryName || undefined,
      confidence: bestConfidence,
      source: bestConfidence > 0.3 ? 'ai_keyword_match' : 'manual_review_needed'
    });
  });
  
  return results;
}
