import { QboCategory, InvoiceLine, CategorySuggestion } from './categorize'

export type HistoricalCategory = {
  vendor: string;
  categoryId: string;
  categoryName: string;
  confidence: number;
  frequency: number;
  lastUsed: string;
}

export type VendorPattern = {
  vendor: string;
  dominantCategory: string;
  categoryId: string;
  consistency: number; // 0-1, how often this vendor uses the same category
  totalInvoices: number;
  lastUpdated: string;
}

export class HistoricalCategorizer {
  private vendorPatterns: Map<string, VendorPattern> = new Map()
  private historicalData: HistoricalCategory[] = []

  constructor() {
    this.loadHistoricalData()
  }

  // Load historical categorization data from QBO
  private async loadHistoricalData() {
    try {
      // This would query QBO for historical Bill data
      // For now, we'll use a mock implementation
      console.log('Loading historical categorization data...')
      // TODO: Implement QBO historical data fetching
    } catch (error) {
      console.error('Error loading historical data:', error)
    }
  }

  // Analyze vendor patterns from historical data
  analyzeVendorPatterns(invoices: any[]): Map<string, VendorPattern> {
    const vendorStats = new Map<string, Map<string, number>>()
    
    invoices.forEach(invoice => {
      const vendor = invoice.vendor_name || invoice.vendor
      if (!vendor) return
      
      if (!vendorStats.has(vendor)) {
        vendorStats.set(vendor, new Map())
      }
      
      const vendorMap = vendorStats.get(vendor)!
      
      // Count category usage for this vendor
      if (invoice.line_categories) {
        Object.values(invoice.line_categories).forEach((lineCat: any) => {
          if (lineCat.categoryId) {
            const count = vendorMap.get(lineCat.categoryId) || 0
            vendorMap.set(lineCat.categoryId, count + 1)
          }
        })
      }
    })

    // Calculate patterns
    const patterns = new Map<string, VendorPattern>()
    
    vendorStats.forEach((categoryCounts, vendor) => {
      const totalInvoices = Array.from(categoryCounts.values()).reduce((sum, count) => sum + count, 0)
      const dominantCategory = Array.from(categoryCounts.entries())
        .sort(([,a], [,b]) => b - a)[0]
      
      if (dominantCategory) {
        const [categoryId, count] = dominantCategory
        const consistency = count / totalInvoices
        
        patterns.set(vendor, {
          vendor,
          dominantCategory: categoryId, // This would be the category name
          categoryId,
          consistency,
          totalInvoices,
          lastUpdated: new Date().toISOString()
        })
      }
    })

    return patterns
  }

  // Get category suggestion based on historical data
  suggestCategoryFromHistory(
    line: InvoiceLine, 
    vendor: string, 
    categories: QboCategory[]
  ): CategorySuggestion | null {
    const pattern = this.vendorPatterns.get(vendor.toLowerCase())
    
    if (!pattern || pattern.consistency < 0.7) {
      return null // Not confident enough from history
    }

    const category = categories.find(cat => cat.id === pattern.categoryId)
    if (!category) {
      return null
    }

    return {
      categoryId: category.id,
      categoryName: category.name,
      confidence: pattern.consistency,
      source: 'vendor-default'
    }
  }

  // Update historical data when a new categorization is made
  updateHistoricalData(
    vendor: string, 
    categoryId: string, 
    categoryName: string, 
    confidence: number
  ) {
    const existing = this.historicalData.find(
      h => h.vendor === vendor && h.categoryId === categoryId
    )

    if (existing) {
      existing.frequency += 1
      existing.confidence = (existing.confidence + confidence) / 2
      existing.lastUsed = new Date().toISOString()
    } else {
      this.historicalData.push({
        vendor,
        categoryId,
        categoryName,
        confidence,
        frequency: 1,
        lastUsed: new Date().toISOString()
      })
    }

    // Update vendor patterns
    this.updateVendorPatterns()
  }

  private updateVendorPatterns() {
    const vendorGroups = new Map<string, HistoricalCategory[]>()
    
    this.historicalData.forEach(entry => {
      if (!vendorGroups.has(entry.vendor)) {
        vendorGroups.set(entry.vendor, [])
      }
      vendorGroups.get(entry.vendor)!.push(entry)
    })

    vendorGroups.forEach((entries, vendor) => {
      const totalFrequency = entries.reduce((sum, entry) => sum + entry.frequency, 0)
      const dominantEntry = entries.sort((a, b) => b.frequency - a.frequency)[0]
      
      if (dominantEntry) {
        this.vendorPatterns.set(vendor, {
          vendor,
          dominantCategory: dominantEntry.categoryName,
          categoryId: dominantEntry.categoryId,
          consistency: dominantEntry.frequency / totalFrequency,
          totalInvoices: totalFrequency,
          lastUpdated: new Date().toISOString()
        })
      }
    })
  }

  // Get vendor pattern for a specific vendor
  getVendorPattern(vendor: string): VendorPattern | null {
    return this.vendorPatterns.get(vendor.toLowerCase()) || null
  }

  // Get all vendor patterns
  getAllVendorPatterns(): VendorPattern[] {
    return Array.from(this.vendorPatterns.values())
  }
}
