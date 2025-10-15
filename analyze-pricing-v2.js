const fs = require('fs');
const catalog = JSON.parse(fs.readFileSync('PROVIDER_CATALOG.json', 'utf8'));

const results = {
  chat: {
    totalProviders: 0,
    totalModels: 0,
    complete: [],
    missing: [],
    incomplete: []
  },
  image: {
    totalProviders: 0,
    totalModels: 0,
    complete: [],
    missing: [],
    incomplete: []
  }
};

function analyzeChatModels(providerType, providerName, models) {
  results.chat.totalProviders++;
  for (const [modelId, model] of Object.entries(models)) {
    results.chat.totalModels++;
    
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
      results.chat.missing.push(entry);
    } else {
      const hasInput = model.pricing.input !== undefined && model.pricing.input !== null;
      const hasOutput = model.pricing.output !== undefined && model.pricing.output !== null;
      const hasUnit = model.pricing.unit !== undefined;
      
      if (!hasInput || !hasOutput) {
        entry.issue = `Missing ${!hasInput ? 'input' : ''} ${!hasInput && !hasOutput ? 'and' : ''} ${!hasOutput ? 'output' : ''} pricing`;
        entry.pricing = model.pricing;
        results.chat.incomplete.push(entry);
      } else if (!hasUnit) {
        entry.issue = 'Missing unit specification';
        entry.pricing = model.pricing;
        results.chat.incomplete.push(entry);
      } else {
        entry.pricing = model.pricing;
        results.chat.complete.push(entry);
      }
    }
  }
}

function analyzeImageModels(providerType, providerName, models) {
  results.image.totalProviders++;
  for (const [modelId, model] of Object.entries(models)) {
    results.image.totalModels++;
    
    const entry = {
      provider: providerName,
      type: providerType,
      model: modelId,
      category: model.category || 'unknown',
      available: model.available !== false
    };
    
    if (!model.pricing) {
      entry.issue = 'No pricing object';
      results.image.missing.push(entry);
    } else {
      const hasUnit = model.pricing.unit !== undefined;
      const hasPriceInfo = Object.keys(model.pricing).length > 1; // More than just 'unit'
      
      if (!hasPriceInfo) {
        entry.issue = 'No price values (only unit specified)';
        entry.pricing = model.pricing;
        results.image.incomplete.push(entry);
      } else if (!hasUnit) {
        entry.issue = 'Missing unit specification';
        entry.pricing = model.pricing;
        results.image.incomplete.push(entry);
      } else {
        entry.pricing = model.pricing;
        results.image.complete.push(entry);
      }
    }
  }
}

// Analyze chat providers
console.log('=== ANALYZING CHAT/COMPLETION PROVIDERS ===\n');
if (catalog.chat && catalog.chat.providers) {
  for (const [type, provider] of Object.entries(catalog.chat.providers)) {
    if (provider.models) {
      analyzeChatModels(type, provider.name, provider.models);
    }
  }
}

console.log(`Total Chat Providers: ${results.chat.totalProviders}`);
console.log(`Total Chat Models: ${results.chat.totalModels}`);
console.log(`✅ Complete: ${results.chat.complete.length}`);
console.log(`❌ Missing: ${results.chat.missing.length}`);
console.log(`⚠️  Incomplete: ${results.chat.incomplete.length}`);

if (results.chat.missing.length > 0) {
  console.log('\n--- CHAT MODELS MISSING PRICING ---');
  results.chat.missing.forEach(m => {
    console.log(`❌ ${m.provider} (${m.type}) - ${m.model} [${m.category}]`);
  });
}

if (results.chat.incomplete.length > 0) {
  console.log('\n--- CHAT MODELS WITH INCOMPLETE PRICING ---');
  results.chat.incomplete.forEach(m => {
    console.log(`⚠️  ${m.provider} (${m.type}) - ${m.model} [${m.category}]`);
    console.log(`   Issue: ${m.issue}`);
    console.log(`   Current: ${JSON.stringify(m.pricing)}`);
  });
}

// Analyze image providers
console.log('\n\n=== ANALYZING IMAGE GENERATION PROVIDERS ===\n');
if (catalog.image && catalog.image.providers) {
  for (const [type, provider] of Object.entries(catalog.image.providers)) {
    if (provider.models) {
      analyzeImageModels(type, provider.name, provider.models);
    }
  }
}

console.log(`Total Image Providers: ${results.image.totalProviders}`);
console.log(`Total Image Models: ${results.image.totalModels}`);
console.log(`✅ Complete: ${results.image.complete.length}`);
console.log(`❌ Missing: ${results.image.missing.length}`);
console.log(`⚠️  Incomplete: ${results.image.incomplete.length}`);

if (results.image.missing.length > 0) {
  console.log('\n--- IMAGE MODELS MISSING PRICING ---');
  results.image.missing.forEach(m => {
    console.log(`❌ ${m.provider} (${m.type}) - ${m.model}`);
  });
}

if (results.image.incomplete.length > 0) {
  console.log('\n--- IMAGE MODELS WITH INCOMPLETE PRICING ---');
  results.image.incomplete.forEach(m => {
    console.log(`⚠️  ${m.provider} (${m.type}) - ${m.model}`);
    console.log(`   Issue: ${m.issue}`);
    console.log(`   Current: ${JSON.stringify(m.pricing)}`);
  });
}

// Summary
console.log('\n\n=== OVERALL SUMMARY ===');
const totalModels = results.chat.totalModels + results.image.totalModels;
const totalComplete = results.chat.complete.length + results.image.complete.length;
const totalMissing = results.chat.missing.length + results.image.missing.length;
const totalIncomplete = results.chat.incomplete.length + results.image.incomplete.length;

console.log(`\nTotal Models Across All Providers: ${totalModels}`);
console.log(`✅ Complete with Pricing: ${totalComplete} (${Math.round(totalComplete/totalModels*100)}%)`);
console.log(`❌ Missing Pricing: ${totalMissing}`);
console.log(`⚠️  Incomplete Pricing: ${totalIncomplete}`);

if (totalMissing === 0 && totalIncomplete === 0) {
  console.log('\n🎉 ALL MODELS HAVE COMPLETE PRICING INFORMATION!');
} else {
  console.log(`\n⚠️  ${totalMissing + totalIncomplete} models need attention`);
}

// Save detailed report
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    totalModels,
    complete: totalComplete,
    missing: totalMissing,
    incomplete: totalIncomplete,
    completionRate: `${Math.round(totalComplete/totalModels*100)}%`
  },
  chat: results.chat,
  image: results.image
};

fs.writeFileSync('pricing_analysis_report.json', JSON.stringify(report, null, 2));
console.log('\n📄 Detailed report saved to: pricing_analysis_report.json');
