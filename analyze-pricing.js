const fs = require('fs');
const catalog = JSON.parse(fs.readFileSync('PROVIDER_CATALOG.json', 'utf8'));

const results = {
  totalProviders: 0,
  totalModels: 0,
  missingPricing: [],
  incompletePricing: [],
  complete: []
};

function analyzeModels(providerType, providerName, models) {
  results.totalProviders++;
  for (const [modelId, model] of Object.entries(models)) {
    results.totalModels++;
    
    const entry = {
      provider: providerName,
      type: providerType,
      model: modelId,
      category: model.category || 'unknown',
      contextWindow: model.contextWindow,
      available: model.available !== false
    };
    
    if (!model.pricing) {
      entry.issue = 'No pricing object';
      results.missingPricing.push(entry);
    } else {
      const hasInput = model.pricing.input !== undefined;
      const hasOutput = model.pricing.output !== undefined;
      
      if (!hasInput || !hasOutput) {
        entry.issue = 'Missing input/output pricing';
        entry.pricing = model.pricing;
        results.incompletePricing.push(entry);
      } else {
        entry.pricing = model.pricing;
        results.complete.push(entry);
      }
    }
  }
}

// Analyze chat providers
if (catalog.chat && catalog.chat.providers) {
  for (const [type, provider] of Object.entries(catalog.chat.providers)) {
    if (provider.models) {
      analyzeModels(type, provider.name, provider.models);
    }
  }
}

// Analyze image providers
if (catalog.image && catalog.image.providers) {
  for (const [type, provider] of Object.entries(catalog.image.providers)) {
    if (provider.models) {
      analyzeModels(type, provider.name, provider.models);
    }
  }
}

console.log('=== PROVIDER CATALOG ANALYSIS ===\n');
console.log('Total Providers:', results.totalProviders);
console.log('Total Models:', results.totalModels);
console.log('Complete:', results.complete.length);
console.log('Missing Pricing:', results.missingPricing.length);
console.log('Incomplete Pricing:', results.incompletePricing.length);

console.log('\n--- MODELS MISSING PRICING ---');
results.missingPricing.forEach(m => {
  console.log(`❌ ${m.provider} (${m.type}) - ${m.model} [${m.category}] - ${m.issue}`);
});

console.log('\n--- MODELS WITH INCOMPLETE PRICING ---');
results.incompletePricing.forEach(m => {
  console.log(`⚠️  ${m.provider} (${m.type}) - ${m.model} [${m.category}] - ${m.issue}`);
  console.log(`   Current: ${JSON.stringify(m.pricing)}`);
});

console.log('\n--- SUMMARY BY PROVIDER ---');
const byProvider = {};
[...results.complete, ...results.missingPricing, ...results.incompletePricing].forEach(m => {
  if (!byProvider[m.type]) {
    byProvider[m.type] = {complete: 0, missing: 0, incomplete: 0};
  }
  if (results.complete.includes(m)) byProvider[m.type].complete++;
  if (results.missingPricing.includes(m)) byProvider[m.type].missing++;
  if (results.incompletePricing.includes(m)) byProvider[m.type].incomplete++;
});

for (const [type, counts] of Object.entries(byProvider)) {
  const total = counts.complete + counts.missing + counts.incomplete;
  console.log(`${type}: ${counts.complete}/${total} complete, ${counts.missing} missing, ${counts.incomplete} incomplete`);
}

// Output detailed list for fixing
console.log('\n--- MODELS NEEDING ATTENTION ---');
const needsAttention = [...results.missingPricing, ...results.incompletePricing];
fs.writeFileSync('pricing_issues.json', JSON.stringify(needsAttention, null, 2));
console.log(`\nDetailed list saved to: pricing_issues.json`);
