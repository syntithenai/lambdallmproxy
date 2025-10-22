# Enhanced Debug Logging for PDF Conversion

## Purpose

Added comprehensive logging throughout the PDF conversion pipeline to diagnose why "Devil in the Strawstack..." PDF returns "No content" despite being text-based.

## Logging Added

### 1. File Converter (src/rag/file-converters.js)

**PDF Conversion Process:**
```javascript
console.log('📄 Starting PDF conversion...');
console.log('📦 Loading pdf-parse module...');
console.log('✅ pdf-parse loaded');
console.log(`📊 Buffer size: ${buffer.length} bytes`);
console.log('🔄 Parsing PDF...');
console.log('✅ PDF parse complete');

console.log(`📄 PDF parsed successfully:`, {
  pages: data.numpages,
  textLength: data.text?.length || 0,
  hasText: !!data.text,
  textPreview: data.text ? data.text.substring(0, 100) + '...' : '(no text)'
});

console.log(`✅ PDF converted to markdown:`, {
  markdownLength: markdown.length,
  pageCount: pages.filter(p => p.trim()).length,
  markdownPreview: markdown.substring(0, 150) + '...'
});
```

### 2. Lambda Handler (src/lambda_search_llm_handler.js)

**Conversion Handler:**
```javascript
console.log(`📄 Converting file: ${body.fileName} (${body.mimeType})`);
console.log(`📊 Buffer size: ${body.fileBuffer.length} chars (base64)`);
console.log(`📊 Decoded buffer size: ${buffer.length} bytes`);
console.log('🔄 Starting conversion...');

console.log(`✅ Conversion complete. Result:`, {
  hasMarkdown: !!result.markdown,
  markdownLength: result.markdown?.length || 0,
  hasImages: !!result.images,
  imageCount: result.images?.length || 0,
  markdownPreview: result.markdown ? result.markdown.substring(0, 100) + '...' : '(empty)'
});

// Validation
if (!markdown || markdown.trim().length === 0) {
  console.error('❌ Conversion returned empty markdown!');
  throw new Error('PDF conversion returned no content');
}

console.log(`📤 Sending response with markdown length: ${markdown.length}`);
```

### 3. Frontend (ui-new/src/components/SwagPage.tsx)

**Response Processing:**
```javascript
console.log(`📥 Received response for ${file.name}:`, {
  hasBody: !!result.body,
  bodyType: typeof result.body,
  hasMarkdown: !!result.markdown,
  hasContent: !!result.content,
  resultKeys: Object.keys(result)
});

console.log(`🔄 Parsing nested body JSON for ${file.name}...`);
console.log(`✅ Parsed body, keys:`, Object.keys(result));

console.log(`📄 Final result for ${file.name}:`, {
  hasMarkdown: !!result.markdown,
  hasContent: !!result.content,
  markdownLength: result.markdown?.length || 0,
  contentLength: result.content?.length || 0
});
```

## What to Look For

When uploading the PDF, check the browser console and server terminal for this sequence:

### Expected Flow (Working PDF)

**Server Terminal:**
```
📄 Converting file: Devil in the Strawstack... (application/pdf)
📊 Buffer size: 123456 chars (base64)
📊 Decoded buffer size: 92592 bytes
🔄 Starting conversion...
📄 Starting PDF conversion...
📦 Loading pdf-parse module...
✅ pdf-parse loaded
📊 Buffer size: 92592 bytes
🔄 Parsing PDF...
✅ PDF parse complete
📄 PDF parsed successfully: { pages: 20, textLength: 45678, hasText: true, textPreview: 'Devil in the Details...' }
✅ PDF converted to markdown: { markdownLength: 50000, pageCount: 20, markdownPreview: '## Page 1\n\nDevil in the Details...' }
✅ Conversion complete. Result: { hasMarkdown: true, markdownLength: 50000, ... }
📤 Sending response with markdown length: 50000
```

**Browser Console:**
```
📥 Received response for Devil in the Strawstack...: { hasBody: true, bodyType: 'string', hasMarkdown: false, hasContent: false, resultKeys: ['statusCode', 'headers', 'body'] }
🔄 Parsing nested body JSON for Devil in the Strawstack...
✅ Parsed body, keys: ['markdown', 'content']
📄 Final result for Devil in the Strawstack...: { hasMarkdown: true, hasContent: true, markdownLength: 50000, contentLength: 50000 }
```

### Problem Scenarios

#### Scenario 1: Empty Text from PDF
```
📄 PDF parsed successfully: { pages: 20, textLength: 0, hasText: false, textPreview: '(no text)' }
⚠️ PDF has no extractable text content
```
**Cause:** PDF is image-based or uses unsupported text encoding

#### Scenario 2: Empty Markdown After Conversion
```
📄 PDF parsed successfully: { pages: 20, textLength: 5000, hasText: true }
✅ PDF converted to markdown: { markdownLength: 0, pageCount: 0 }
❌ Conversion returned empty markdown!
```
**Cause:** Text exists but all pages are empty after trimming

#### Scenario 3: Response Not Reaching Frontend
```
Server: 📤 Sending response with markdown length: 50000
Browser: 📥 Received response: { hasBody: false, hasMarkdown: false }
```
**Cause:** Response format issue or network problem

#### Scenario 4: Body Parsing Fails
```
📥 Received response: { hasBody: true, bodyType: 'string' }
🔄 Parsing nested body JSON...
❌ Failed to parse response body: SyntaxError
```
**Cause:** Body contains invalid JSON

## Debugging Steps

### 1. Check Server Terminal
Look for the complete conversion flow. If you see:
- ❌ at any step → Error occurred there
- Missing logs → Process stopped at previous step
- Empty values → Check the specific field that's empty

### 2. Check Browser Console
Look for the response parsing. If you see:
- `hasBody: false` → Response structure wrong
- `bodyType: 'object'` → Body already parsed (not Lambda format)
- Parse error → Body contains invalid JSON
- `markdownLength: 0` → Empty content received

### 3. Test PDF Locally
If server shows text extraction worked but frontend shows empty:
```bash
# In project root
node -e "
const fs = require('fs');
const pdfParse = require('pdf-parse');
const buffer = fs.readFileSync('path/to/Devil.pdf');
pdfParse(buffer).then(data => {
  console.log('Pages:', data.numpages);
  console.log('Text length:', data.text.length);
  console.log('First 500 chars:', data.text.substring(0, 500));
});
"
```

### 4. Check Network Tab
Open browser DevTools → Network tab → Find POST to `/convert-to-markdown`:
- Check request payload (should have file buffer)
- Check response body (should have markdown)
- Check response size (should be > 0)

## Common Issues & Solutions

### Issue 1: "Buffer size: 0 bytes"
**Cause:** File not uploaded correctly
**Solution:** Check FormData, verify file input

### Issue 2: "textLength: 0" but PDF has text
**Cause:** PDF uses complex encoding or is encrypted
**Solution:** Try re-exporting PDF, check for password protection

### Issue 3: "markdownLength: 0" but textLength > 0
**Cause:** All pages empty after trimming (whitespace-only)
**Solution:** Check if PDF has only whitespace or special characters

### Issue 4: Frontend receives empty despite server showing content
**Cause:** Response serialization issue
**Solution:** Check if response.write() is called correctly

## Files Modified

1. **src/rag/file-converters.js**
   - Added step-by-step logging in convertPDFToMarkdown
   - Added text preview in logs
   - Added markdown preview in logs

2. **src/lambda_search_llm_handler.js**
   - Added logging at each conversion step
   - Added validation before sending response
   - Added markdown preview in logs

3. **ui-new/src/components/SwagPage.tsx**
   - Added detailed response structure logging
   - Added parsing step logging
   - Added final result validation logging

## Next Steps

After uploading the PDF with these logs:

1. **Share the logs** from both server terminal and browser console
2. **Check for specific error** at any step
3. **Identify where the content is lost**:
   - If server shows content but frontend doesn't → Response parsing issue
   - If PDF parsing fails → PDF structure issue
   - If markdown generation fails → Text processing issue

The detailed logs will pinpoint exactly where the problem occurs!
