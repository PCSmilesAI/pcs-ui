/**
 * PCS AI Knowledge Base Invoice Parsing System
 * 
 * This module provides:
 * - PDF to image conversion for PCS AI vision API
 * - Vendor knowledge base management
 * - Historical invoice database for few-shot learning
 * - PCS AI invoice parsing with knowledge base context
 * - Automatic knowledge base training from corrections
 */

// PDF to Image conversion
export { 
  convertPdfToImages,
  convertPdfToBase64Images,
  formatImagesForOpenAI,
  getPdfPageCount
} from './pdfToImages';

// Knowledge Base CRUD operations
export {
  getAllKnowledgeBases,
  getKnowledgeBase,
  getKnowledgeBaseById,
  upsertKnowledgeBase,
  deleteKnowledgeBase,
  searchKnowledgeBases,
  getAllSystemPrompts,
  getSystemPrompt,
  getTrainingPrompt,
  getMasterParsingPrompt,
  updateSystemPrompt,
  generateDefaultKnowledgePrompt,
  getOrCreateKnowledgeBase,
  getKnowledgeBaseStats,
  type VendorKnowledgeBase,
  type SystemPrompt
} from './knowledgeBase';

// PCS AI Invoice Parsing
export {
  parseInvoiceWithGPT,
  parseInvoiceFromImages,
  detectVendor,
  trainFromCorrection,
  testGPTConnection,
  type ParsedInvoice,
  type ParseResult,
  type TrainingInput,
  type TrainingResult
} from './parseInvoice';

// Vendor History Database (for few-shot learning)
export {
  getVendorHistory,
  getRecentHistory,
  addToHistory,
  updateHistoryEntry,
  deleteHistoryEntry,
  getAllVendorsWithHistory,
  isInvoiceInHistory,
  getHistoryStats,
  formatHistoryForPrompt,
  getHistoryImages,
  MAX_HISTORY_EXAMPLES,
  type HistoricalInvoice,
  type VendorHistory
} from './vendorHistory';

// Auto-add to history on confirmation
export {
  maybeAddToHistory,
  batchAddToHistory
} from './historyAutoAdd';

// Bulk parsing operations
export {
  runBulkParse,
  parseAndSave,
  scanForPDFs,
  loadProgress,
  saveProgress,
  clearProgress,
  estimateBulkParseTime,
  getAlreadyParsedFiles,
  type BulkParseProgress,
  type BulkParseOptions,
} from './bulkParse';

// Document Classification (for routing invoices vs other documents)
export {
  classifyDocument,
  isLikelyInvoice,
  getDocumentTypeDisplayName,
  getDocumentTypeColor,
  type DocumentType,
  type EmailContext,
  type ClassificationResult,
  type ClassificationResponse,
} from './documentClassifier';
