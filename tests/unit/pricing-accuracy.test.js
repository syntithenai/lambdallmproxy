/**
 * Pricing Accuracy Test
 * 
 * Ensures frontend and backend pricing databases stay in sync.
 * Prevents drift between ui-new/src/utils/pricing.ts and src/services/google-sheets-logger.js
 * 
 * Run with: npm test tests/unit/pricing-accuracy.test.js
 */

const fs = require('fs');
const path = require('path');

// Load backend pricing from google-sheets-logger.js
function loadBackendPricing() {
  const loggerPath = path.join(__dirname, '../../src/services/google-sheets-logger.js');
  const loggerCode = fs.readFileSync(loggerPath, 'utf-8');
  
  // Extract PRICING object - match from "const PRICING =" to the closing brace
  const startIdx = loggerCode.indexOf('const PRICING = {');
  if (startIdx === -1) {
    throw new Error('Could not find PRICING object in google-sheets-logger.js');
  }
  
  // Find matching closing brace
  let braceCount = 0;
  let endIdx = startIdx;
  let foundStart = false;
  
  for (let i = startIdx; i < loggerCode.length; i++) {
    if (loggerCode[i] === '{') {
      braceCount++;
      foundStart = true;
    } else if (loggerCode[i] === '}') {
      braceCount--;
      if (braceCount === 0 && foundStart) {
        endIdx = i + 1;
        break;
      }
    }
  }
  
  const pricingBlock = loggerCode.substring(startIdx, endIdx);
  const pricing = {};
  
  // Match model entries: 'model-name': { input: X, output: Y }
  const modelRegex = /['"]([^'"]+)['"]:\s*\{\s*input:\s*([\d.]+),\s*output:\s*([\d.]+)\s*\}/g;
  let match;
  
  while ((match = modelRegex.exec(pricingBlock)) !== null) {
    const [, modelName, inputPrice, outputPrice] = match;
    pricing[modelName] = {
      input: parseFloat(inputPrice),
      output: parseFloat(outputPrice),
    };
  }
  
  return pricing;
}

// Load frontend pricing from pricing.ts
function loadFrontendPricing() {
  const pricingPath = path.join(__dirname, '../../ui-new/src/utils/pricing.ts');
  const pricingCode = fs.readFileSync(pricingPath, 'utf-8');
  
  // Extract MODEL_PRICING object - match from "export const MODEL_PRICING" to closing brace
  const startIdx = pricingCode.indexOf('export const MODEL_PRICING');
  if (startIdx === -1) {
    throw new Error('Could not find MODEL_PRICING object in pricing.ts');
  }
  
  // Find the opening brace
  const openBraceIdx = pricingCode.indexOf('{', startIdx);
  if (openBraceIdx === -1) {
    throw new Error('Could not find opening brace for MODEL_PRICING');
  }
  
  // Find matching closing brace
  let braceCount = 0;
  let endIdx = openBraceIdx;
  let foundStart = false;
  
  for (let i = openBraceIdx; i < pricingCode.length; i++) {
    if (pricingCode[i] === '{') {
      braceCount++;
      foundStart = true;
    } else if (pricingCode[i] === '}') {
      braceCount--;
      if (braceCount === 0 && foundStart) {
        endIdx = i + 1;
        break;
      }
    }
  }
  
  const pricingBlock = pricingCode.substring(openBraceIdx, endIdx);
  const pricing = {};
  
  // Match model entries: 'model-name': { input: X, output: Y }
  // Updated regex to handle inline comments after values
  const modelRegex = /['"]([^'"]+)['"]:\s*\{\s*input:\s*([\d.]+),?\s*(?:\/\/[^\n]*)?\s*output:\s*([\d.]+)/g;
  let match;
  
  while ((match = modelRegex.exec(pricingBlock)) !== null) {
    const [, modelName, inputPrice, outputPrice] = match;
    pricing[modelName] = {
      input: parseFloat(inputPrice),
      output: parseFloat(outputPrice),
    };
  }
  
  return pricing;
}

describe('Pricing Accuracy Tests', () => {
  let backendPricing;
  let frontendPricing;
  
  beforeAll(() => {
    backendPricing = loadBackendPricing();
    frontendPricing = loadFrontendPricing();
  });
  
  test('Backend and frontend pricing should be loaded', () => {
    expect(Object.keys(backendPricing).length).toBeGreaterThan(0);
    expect(Object.keys(frontendPricing).length).toBeGreaterThan(0);
    
    console.log(`Backend models: ${Object.keys(backendPricing).length}`);
    console.log(`Frontend models: ${Object.keys(frontendPricing).length}`);
    
    // Debug: Check if Gemini models are present
    const geminiBackend = Object.keys(backendPricing).filter(m => m.includes('gemini'));
    const geminiFrontend = Object.keys(frontendPricing).filter(m => m.includes('gemini'));
    console.log('Gemini in backend:', geminiBackend);
    console.log('Gemini in frontend:', geminiFrontend);
  });
  
  test('All backend models should exist in frontend with matching prices', () => {
    const missingModels = [];
    const priceMismatches = [];
    
    for (const [model, backendPrice] of Object.entries(backendPricing)) {
      if (!frontendPricing[model]) {
        missingModels.push(model);
        continue;
      }
      
      const frontendPrice = frontendPricing[model];
      
      // Allow small floating point differences (0.01)
      const inputMatch = Math.abs(backendPrice.input - frontendPrice.input) < 0.01;
      const outputMatch = Math.abs(backendPrice.output - frontendPrice.output) < 0.01;
      
      if (!inputMatch || !outputMatch) {
        priceMismatches.push({
          model,
          backend: backendPrice,
          frontend: frontendPrice,
        });
      }
    }
    
    if (missingModels.length > 0) {
      console.error('Missing models in frontend:', missingModels);
    }
    
    if (priceMismatches.length > 0) {
      console.error('Price mismatches:');
      priceMismatches.forEach(({ model, backend, frontend }) => {
        console.error(`  ${model}:`);
        console.error(`    Backend:  input=$${backend.input}, output=$${backend.output}`);
        console.error(`    Frontend: input=$${frontend.input}, output=$${frontend.output}`);
      });
    }
    
    expect(missingModels).toEqual([]);
    expect(priceMismatches).toEqual([]);
  });
  
  test('Groq models should be free ($0 per million tokens)', () => {
    const groqModels = Object.keys(backendPricing).filter(m => 
      m.startsWith('llama') || 
      m.includes('mixtral') || 
      m.includes('gemma')
    );
    
    const nonFreeGroq = [];
    
    for (const model of groqModels) {
      const backendPrice = backendPricing[model];
      const frontendPrice = frontendPricing[model];
      
      if (backendPrice && (backendPrice.input !== 0 || backendPrice.output !== 0)) {
        nonFreeGroq.push({ model, location: 'backend', price: backendPrice });
      }
      
      if (frontendPrice && (frontendPrice.input !== 0 || frontendPrice.output !== 0)) {
        nonFreeGroq.push({ model, location: 'frontend', price: frontendPrice });
      }
    }
    
    if (nonFreeGroq.length > 0) {
      console.error('Groq models with non-zero pricing:');
      nonFreeGroq.forEach(({ model, location, price }) => {
        console.error(`  ${model} (${location}): input=$${price.input}, output=$${price.output}`);
      });
    }
    
    expect(nonFreeGroq).toEqual([]);
  });
  
  test('Gemini free tier models should be free ($0 per million tokens)', () => {
    const geminiFreeTierModels = [
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
    ];
    
    const nonFreeGemini = [];
    
    for (const model of geminiFreeTierModels) {
      const backendPrice = backendPricing[model];
      const frontendPrice = frontendPricing[model];
      
      if (backendPrice && (backendPrice.input !== 0 || backendPrice.output !== 0)) {
        nonFreeGemini.push({ model, location: 'backend', price: backendPrice });
      }
      
      if (frontendPrice && (frontendPrice.input !== 0 || frontendPrice.output !== 0)) {
        nonFreeGemini.push({ model, location: 'frontend', price: frontendPrice });
      }
    }
    
    if (nonFreeGemini.length > 0) {
      console.error('Gemini free tier models with non-zero pricing:');
      nonFreeGemini.forEach(({ model, location, price }) => {
        console.error(`  ${model} (${location}): input=$${price.input}, output=$${price.output}`);
      });
    }
    
    expect(nonFreeGemini).toEqual([]);
  });
  
  test('Embedding models should have zero output cost', () => {
    const embeddingModels = Object.keys(backendPricing).filter(m => 
      m.includes('embedding') || 
      m.includes('embed')
    );
    
    const invalidEmbeddings = [];
    
    for (const model of embeddingModels) {
      const backendPrice = backendPricing[model];
      const frontendPrice = frontendPricing[model];
      
      if (backendPrice && backendPrice.output !== 0) {
        invalidEmbeddings.push({ model, location: 'backend', outputCost: backendPrice.output });
      }
      
      if (frontendPrice && frontendPrice.output !== 0) {
        invalidEmbeddings.push({ model, location: 'frontend', outputCost: frontendPrice.output });
      }
    }
    
    if (invalidEmbeddings.length > 0) {
      console.error('Embedding models with non-zero output cost:');
      invalidEmbeddings.forEach(({ model, location, outputCost }) => {
        console.error(`  ${model} (${location}): output=$${outputCost} (should be $0)`);
      });
    }
    
    expect(invalidEmbeddings).toEqual([]);
  });
  
  test('Together AI free tier models (with -Free suffix) should be free', () => {
    const togetherFreeTierModels = Object.keys(backendPricing).filter(m => 
      m.includes('-Free')
    );
    
    const nonFreeTogether = [];
    
    for (const model of togetherFreeTierModels) {
      const backendPrice = backendPricing[model];
      const frontendPrice = frontendPricing[model];
      
      if (backendPrice && (backendPrice.input !== 0 || backendPrice.output !== 0)) {
        nonFreeTogether.push({ model, location: 'backend', price: backendPrice });
      }
      
      if (frontendPrice && (frontendPrice.input !== 0 || frontendPrice.output !== 0)) {
        nonFreeTogether.push({ model, location: 'frontend', price: frontendPrice });
      }
    }
    
    if (nonFreeTogether.length > 0) {
      console.error('Together AI -Free models with non-zero pricing:');
      nonFreeTogether.forEach(({ model, location, price }) => {
        console.error(`  ${model} (${location}): input=$${price.input}, output=$${price.output}`);
      });
    }
    
    expect(nonFreeTogether).toEqual([]);
  });
  
  test('All embedding models should be present in both pricing databases', () => {
    const expectedEmbeddings = [
      'text-embedding-3-small',
      'text-embedding-3-large',
      'text-embedding-ada-002',
    ];
    
    const missingFromBackend = expectedEmbeddings.filter(m => !backendPricing[m]);
    const missingFromFrontend = expectedEmbeddings.filter(m => !frontendPricing[m]);
    
    if (missingFromBackend.length > 0) {
      console.error('Embeddings missing from backend:', missingFromBackend);
    }
    
    if (missingFromFrontend.length > 0) {
      console.error('Embeddings missing from frontend:', missingFromFrontend);
    }
    
    expect(missingFromBackend).toEqual([]);
    expect(missingFromFrontend).toEqual([]);
  });
});
