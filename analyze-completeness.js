const fs = require('fs');
const catalog = JSON.parse(fs.readFileSync('PROVIDER_CATALOG.json', 'utf8'));

// Comprehensive field analysis
const requiredChatFields = ['id', 'category', 'contextWindow', 'maxOutput', 'pricing', 'supportsTools', 'supportsVision', 'supportsStreaming'];
const requiredImageFields = ['id', 'pricing', 'supportsSizes', 'supportsQuality'];

const results = {
  chat: { models: [], issues: [] },
  image: { models: [], issues: [] }
};

function analyzeChatModel(providerType, providerName, modelId, model) {
  const analysis = {
    provider: providerName,
    type: providerType,
    model: modelId,
    available: model.available !== false,
    completeness: {},
    missingFields: [],
    warnings: []
  };
  
  // Check required fields
  requiredChatFields.forEach(field => {
    const hasField = model[field] !== undefined;
    analysis.completeness[field] = hasField;
    if (!hasField) {
      analysis.missingFields.push(field);
    }
  });
  
  // Specific checks
  if (model.pricing) {
    if (model.pricing.input === undefined) analysis.warnings.push('Missing input pricing');
    if (model.pricing.output === undefined) analysis.warnings.push('Missing output pricing');
    if (!model.pricing.unit) analysis.warnings.push('Missing pricing unit');
  }
  
  if (!model.category) analysis.warnings.push('No category assigned');
  if (!model.contextWindow || model.contextWindow === 0) analysis.warnings.push('Context window not specified');
  if (!model.maxOutput || model.maxOutput === 0) analysis.warnings.push('Max output not specified');
  
  // Check for deprecated/unavailable models
  if (model.deprecated) analysis.warnings.push('Model is marked as deprecated');
  if (model.available === false) analysis.warnings.push('Model marked as unavailable');
  
  analysis.complete = analysis.missingFields.length === 0 && analysis.warnings.length === 0;
  
  results.chat.models.push(analysis);
  if (!analysis.complete) {
    results.chat.issues.push(analysis);
  }
}

function analyzeImageModel(providerType, providerName, modelId, model) {
  const analysis = {
    provider: providerName,
    type: providerType,
    model: modelId,
    available: model.available !== false,
    completeness: {},
    missingFields: [],
    warnings: []
  };
  
  // Check required fields
  requiredImageFields.forEach(field => {
    const hasField = model[field] !== undefined;
    analysis.completeness[field] = hasField;
    if (!hasField) {
      analysis.missingFields.push(field);
    }
  });
  
  // Specific checks
  if (!model.pricing || typeof model.pricing !== 'object') {
    analysis.warnings.push('No pricing information');
  } else if (!model.pricing.unit) {
    analysis.warnings.push('Missing pricing unit');
  }
  
  if (!model.supportsSizes || typeof model.supportsSizes !== 'object') {
    analysis.warnings.push('Supported sizes not specified');
  }
  
  if (model.available === false) analysis.warnings.push('Model marked as unavailable');
  
  analysis.complete = analysis.missingFields.length === 0 && analysis.warnings.length === 0;
  
  results.image.models.push(analysis);
  if (!analysis.complete) {
    results.image.issues.push(analysis);
  }
}

// Analyze all providers
if (catalog.chat && catalog.chat.providers) {
  for (const [type, provider] of Object.entries(catalog.chat.providers)) {
    if (provider.models) {
      for (const [modelId, model] of Object.entries(provider.models)) {
        analyzeChatModel(type, provider.name, modelId, model);
      }
    }
  }
}

if (catalog.image && catalog.image.providers) {
  for (const [type, provider] of Object.entries(catalog.image.providers)) {
    if (provider.models) {
      for (const [modelId, model] of Object.entries(provider.models)) {
        analyzeImageModel(type, provider.name, modelId, model);
      }
    }
  }
}

// Print report
console.log('═══════════════════════════════════════════════════════');
console.log('     PROVIDER CATALOG COMPLETENESS ANALYSIS');
console.log('═══════════════════════════════════════════════════════\n');

console.log('📊 CHAT/COMPLETION MODELS\n');
console.log(`Total Models: ${results.chat.models.length}`);
console.log(`✅ Complete: ${results.chat.models.filter(m => m.complete).length}`);
console.log(`⚠️  With Issues: ${results.chat.issues.length}`);

if (results.chat.issues.length > 0) {
  console.log('\n--- Models with Issues ---');
  results.chat.issues.forEach(m => {
    console.log(`\n${m.provider} (${m.type}) - ${m.model} ${!m.available ? '[UNAVAILABLE]' : ''}`);
    if (m.missingFields.length > 0) {
      console.log(`  ❌ Missing fields: ${m.missingFields.join(', ')}`);
    }
    if (m.warnings.length > 0) {
      console.log(`  ⚠️  Warnings: ${m.warnings.join(', ')}`);
    }
  });
}

console.log('\n\n📊 IMAGE GENERATION MODELS\n');
console.log(`Total Models: ${results.image.models.length}`);
console.log(`✅ Complete: ${results.image.models.filter(m => m.complete).length}`);
console.log(`⚠️  With Issues: ${results.image.issues.length}`);

if (results.image.issues.length > 0) {
  console.log('\n--- Models with Issues ---');
  results.image.issues.forEach(m => {
    console.log(`\n${m.provider} (${m.type}) - ${m.model} ${!m.available ? '[UNAVAILABLE]' : ''}`);
    if (m.missingFields.length > 0) {
      console.log(`  ❌ Missing fields: ${m.missingFields.join(', ')}`);
    }
    if (m.warnings.length > 0) {
      console.log(`  ⚠️  Warnings: ${m.warnings.join(', ')}`);
    }
  });
}

// Overall summary
console.log('\n\n═══════════════════════════════════════════════════════');
console.log('                    SUMMARY');
console.log('═══════════════════════════════════════════════════════\n');

const totalModels = results.chat.models.length + results.image.models.length;
const totalComplete = results.chat.models.filter(m => m.complete).length + results.image.models.filter(m => m.complete).length;
const totalIssues = results.chat.issues.length + results.image.issues.length;

console.log(`Total Models: ${totalModels}`);
console.log(`✅ Complete: ${totalComplete} (${Math.round(totalComplete/totalModels*100)}%)`);
console.log(`⚠️  With Issues: ${totalIssues}`);

// Pricing specific summary
const chatWithPricing = results.chat.models.filter(m => m.completeness.pricing).length;
const imageWithPricing = results.image.models.filter(m => m.completeness.pricing).length;
console.log(`\n💰 Pricing Information:`);
console.log(`   Chat Models: ${chatWithPricing}/${results.chat.models.length} (${Math.round(chatWithPricing/results.chat.models.length*100)}%)`);
console.log(`   Image Models: ${imageWithPricing}/${results.image.models.length} (${Math.round(imageWithPricing/results.image.models.length*100)}%)`);
console.log(`   TOTAL: ${chatWithPricing + imageWithPricing}/${totalModels} (${Math.round((chatWithPricing + imageWithPricing)/totalModels*100)}%)`);

if (totalIssues === 0) {
  console.log('\n🎉 ALL MODELS HAVE COMPLETE INFORMATION!');
} else {
  console.log(`\n⚠️  ${totalIssues} models need attention (see details above)`);
}

// Save detailed report
fs.writeFileSync('completeness_report.json', JSON.stringify(results, null, 2));
console.log('\n📄 Detailed report saved to: completeness_report.json');
