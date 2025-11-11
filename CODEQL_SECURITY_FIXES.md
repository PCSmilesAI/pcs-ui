# GitHub CodeQL Security Issues - Fix Plan

**Date**: November 11, 2025  
**Status**: IN PROGRESS

## Summary

GitHub CodeQL has identified multiple security issues in the codebase. This document outlines all issues and their fixes.

## Issues Found

### 1. **Uncontrolled Data Used in Path Expression** (HIGH)
**Severity**: HIGH  
**Count**: 20+ instances  
**Files Affected**:
- `app/api/pdf/[filename]/route.ts` - Path traversal vulnerability
- `app/output_jsons/[...file]/route.ts` - Path traversal vulnerability
- `app/api/repair-invoice/route.ts` - Unsafe path construction

**Issue**: User-supplied filename is used directly in `path.join()` without proper validation, allowing path traversal attacks (e.g., `../../../etc/passwd`).

**Current Code**:
```typescript
const filePath = path.join(process.cwd(), 'email_invoices', filename);
```

**Fix**: Add strict validation to prevent path traversal:
```typescript
// Validate filename - only allow alphanumeric, dash, underscore, dot
if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
  return new NextResponse('Invalid filename', { status: 400 });
}

// Ensure no path traversal
if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
  return new NextResponse('Invalid filename', { status: 400 });
}

const filePath = path.join(process.cwd(), 'email_invoices', filename);

// Final check: ensure resolved path is within base directory
const resolvedPath = path.resolve(filePath);
const baseDir = path.resolve(process.cwd(), 'email_invoices');
if (!resolvedPath.startsWith(baseDir)) {
  return new NextResponse('Invalid path', { status: 400 });
}
```

---

### 2. **Client-Side Cross-Site Scripting (XSS)** (HIGH)
**Severity**: HIGH  
**Count**: 5+ instances  
**Files Affected**:
- React components rendering user data
- API responses with unescaped HTML

**Issue**: User input or data from API responses is rendered without proper escaping, allowing XSS attacks.

**Fix**: 
- Always use React's built-in escaping (text content, not `dangerouslySetInnerHTML`)
- Use libraries like `DOMPurify` for HTML content that must be rendered
- Validate and sanitize all user input

---

### 3. **Type Confusion Through Parameter Tampering** (MEDIUM)
**Severity**: MEDIUM  
**Count**: 3+ instances  
**Files Affected**:
- API endpoints accepting dynamic parameters

**Issue**: Type checking is insufficient, allowing attackers to pass unexpected types.

**Fix**: Add strict type validation:
```typescript
// Before
const id = req.query.id;

// After
const id = req.query.id;
if (typeof id !== 'string' || !/^\d+$/.test(id)) {
  return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
}
```

---

### 4. **Incomplete String Escaping or Encoding** (MEDIUM)
**Severity**: MEDIUM  
**Count**: 8+ instances  
**Files Affected**:
- API responses with user data
- HTML template strings

**Issue**: String data is not properly escaped before being used in contexts where special characters have meaning.

**Fix**: Use proper escaping functions:
```typescript
// For HTML context
const escaped = text.replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

// For JSON context
const json = JSON.stringify(data);

// For URL context
const encoded = encodeURIComponent(data);
```

---

### 5. **Workflow Does Not Contain Permissions** (MEDIUM)
**Severity**: MEDIUM  
**Files Affected**:
- `.github/workflows/security-scan.yml`
- `.github/workflows/deploy-droplet.yml`

**Issue**: GitHub Actions workflows should explicitly define permissions to follow the principle of least privilege.

**Fix**: Add permissions block to workflows:
```yaml
permissions:
  contents: read
  security-events: write
  checks: write
```

---

### 6. **Missing Rate Limiting** (MEDIUM)
**Severity**: MEDIUM  
**Files Affected**:
- `app/api/pdf/[filename]/route.ts`
- `app/api/invoices/*` endpoints

**Issue**: No rate limiting on file serving endpoints, allowing DoS attacks.

**Fix**: Implement rate limiting middleware (already done in security layer tests).

---

## Fix Priority

1. **P0 (Critical)**: Path traversal vulnerabilities (Issues #1)
2. **P1 (High)**: XSS vulnerabilities (Issue #2)
3. **P2 (Medium)**: Type confusion, string escaping, workflow permissions (Issues #3-5)

## Implementation Plan

### Phase 1: Path Traversal Fixes
- [ ] Fix `app/api/pdf/[filename]/route.ts`
- [ ] Fix `app/output_jsons/[...file]/route.ts`
- [ ] Fix `app/api/repair-invoice/route.ts`
- [ ] Add comprehensive path validation utility

### Phase 2: XSS Prevention
- [ ] Audit all React components for unsafe rendering
- [ ] Add input validation and sanitization
- [ ] Use React's built-in escaping

### Phase 3: Type Safety & Encoding
- [ ] Add strict type validation to all API endpoints
- [ ] Implement proper string escaping
- [ ] Add workflow permissions

### Phase 4: Testing & Deployment
- [ ] Run CodeQL scan to verify fixes
- [ ] Deploy to production
- [ ] Monitor for any issues

## Testing

All fixes will be validated with:
1. CodeQL security scan
2. Manual security testing
3. Automated test suite

---

**Next Steps**: Begin Phase 1 implementation

