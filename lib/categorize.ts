export type QboCategory = { 
  id: string; 
  name: string; 
  type: string; 
  subtype: string; 
}

export type InvoiceLine = { 
  description: string; 
  vendor?: string; 
  qty?: number; 
  unit?: number; 
  total?: number; 
}

export type CategorySuggestion = {
  categoryId: string | null;
  categoryName: string | null;
  confidence: number;
  source: 'vendor-default' | 'keyword' | 'manual' | 'none';
}

// Vendor-specific category defaults
const vendorDefaults: Record<string, string> = {
  "henry schein": "Dental Supplies",
  "glidewell": "Dental Lab Fees", 
  "stericycle": "Hazardous Disposal",
  "sanipac": "Hazardous Disposal",
  "oregon linen": "Janitorial",
  "comcast": "Internet",
  "spectrum": "Internet",
  "centurylink": "Internet",
  "pacific power": "Electricity",
  "avista": "Electricity",
  "pge": "Electricity",
}

// Keyword-based category matching
const keywordMap: [RegExp, string][] = [
  // Dental Supplies
  [/\b(bur|prophy|gauze|tip|composite|bond|cement|etch|impression|dental|tooth|oral)\b/i, "Dental Supplies"],
  
  // Dental Lab Fees
  [/\b(aligner|crown|bridge|denture|abutment|implant lab|lab fee|orthodontic)\b/i, "Dental Lab Fees"],
  
  // Dental Equipment
  [/\b(autoclave|compressor|sensor|x[- ]?ray|sterilizer|handpiece|equipment|machine)\b/i, "Dental Equipment"],
  
  // Hazardous Disposal
  [/\b(hazard|bio|medical waste|sharps|disposal|waste)\b/i, "Hazardous Disposal"],
  
  // Janitorial
  [/\b(janitorial|cleaning|cleaner|soap|paper towel|tissue)\b/i, "Janitorial"],
  
  // Internet/IT
  [/\b(internet|comcast|spectrum|centurylink|wifi|network|it|computer)\b/i, "Internet"],
  
  // Utilities
  [/\b(electric|power|pacific power|avist(?:a)?|pge|utility|gas|water)\b/i, "Electricity"],
  
  // Office Supplies
  [/\b(office|supplies|paper|pen|pencil|folder|file)\b/i, "Office Supplies"],
  
  // Marketing
  [/\b(marketing|advertising|promotion|social media|website)\b/i, "Marketing"],
  
  // Insurance
  [/\b(insurance|malpractice|liability|coverage)\b/i, "Insurance"],
]

export function suggestCategory(line: InvoiceLine, categories: QboCategory[]): CategorySuggestion {
  const vendor = (line.vendor || "").toLowerCase().trim();
  const description = (line.description || "").toLowerCase().trim();

  // 1) Vendor default (highest confidence)
  const vendorDefault = vendorDefaults[vendor];
  if (vendorDefault) {
    const category = findCategoryByName(vendorDefault, categories);
    if (category) {
      return { 
        categoryId: category.id, 
        categoryName: category.name, 
        confidence: 0.95, 
        source: 'vendor-default' 
      };
    }
  }

  // 2) Keyword matching
  for (const [regex, categoryName] of keywordMap) {
    if (regex.test(description)) {
      const category = findCategoryByName(categoryName, categories);
      if (category) {
        return { 
          categoryId: category.id, 
          categoryName: category.name, 
          confidence: 0.8, 
          source: 'keyword' 
        };
      }
    }
  }

  // 3) Partial keyword matching (lower confidence)
  for (const [regex, categoryName] of keywordMap) {
    const partialRegex = new RegExp(regex.source.replace(/\\b/g, ''), 'i');
    if (partialRegex.test(description)) {
      const category = findCategoryByName(categoryName, categories);
      if (category) {
        return { 
          categoryId: category.id, 
          categoryName: category.name, 
          confidence: 0.6, 
          source: 'keyword' 
        };
      }
    }
  }

  // 4) No match found
  return { 
    categoryId: null, 
    categoryName: null, 
    confidence: 0, 
    source: 'none' 
  };
}

function findCategoryByName(nameLike: string, categories: QboCategory[]): QboCategory | null {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const target = normalize(nameLike);
  
  // Exact match first
  let category = categories.find(c => normalize(c.name) === target);
  if (category) return category;
  
  // Partial match
  category = categories.find(c => normalize(c.name).includes(target));
  if (category) return category;
  
  // Reverse partial match (target contains category name)
  category = categories.find(c => target.includes(normalize(c.name)));
  if (category) return category;
  
  return null;
}

export function categorizeInvoiceLines(
  lines: InvoiceLine[], 
  vendor: string, 
  categories: QboCategory[],
  historicalCategorizer?: any
): Array<CategorySuggestion & { index: number }> {
  return lines.map((line, index) => {
    // First try historical data if available
    if (historicalCategorizer) {
      const historicalSuggestion = historicalCategorizer.suggestCategoryFromHistory(
        line, vendor, categories
      )
      if (historicalSuggestion) {
        return {
          index,
          ...historicalSuggestion
        }
      }
    }

    // Fall back to keyword-based categorization
    return {
      index,
      ...suggestCategory({ ...line, vendor }, categories)
    }
  });
}
