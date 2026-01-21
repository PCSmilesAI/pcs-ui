/**
 * GPT-4o Knowledge Base Invoice Parsing System
 * 
 * This module provides:
 * - PDF to image conversion for GPT vision API
 * - Vendor knowledge base management
 * - GPT-4o invoice parsing with knowledge base context
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
  updateSystemPrompt,
  generateDefaultKnowledgePrompt,
  getOrCreateKnowledgeBase,
  getKnowledgeBaseStats,
  type VendorKnowledgeBase,
  type SystemPrompt
} from './knowledgeBase';

// GPT Invoice Parsing
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
