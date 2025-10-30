const catalog = require('./PROVIDER_CATALOG.json');

console.log('=== Anthropic Provider Verification ===\n');

// Check if Anthropic is in chat providers
if (catalog.chat && catalog.chat.providers && catalog.chat.providers.anthropic) {
  console.log('✅ Anthropic found in chat.providers');
  console.log('\nProvider details:');
  console.log('  Name:', catalog.chat.providers.anthropic.name);
  console.log('  Type:', catalog.chat.providers.anthropic.type);
  console.log('  API Base:', catalog.chat.providers.anthropic.apiBase);
  console.log('  Supports Streaming:', catalog.chat.providers.anthropic.supportsStreaming);
  console.log('  Supports Tools:', catalog.chat.providers.anthropic.supportsTools);
  
  console.log('\nModels:');
  const models = Object.keys(catalog.chat.providers.anthropic.models || {});
  models.forEach(modelId => {
    const model = catalog.chat.providers.anthropic.models[modelId];
    console.log(`  - ${modelId}: ${model.description || 'No description'}`);
    console.log(`    Pricing: $${model.pricing.input}/$${model.pricing.output} per M tokens`);
  });
  
  console.log('\n✅ Anthropic integration is correctly configured in PROVIDER_CATALOG.json');
} else {
  console.log('❌ Anthropic NOT found in chat.providers');
}

// Check if accidentally in whisper section
if (catalog.whisper && catalog.whisper.providers && catalog.whisper.providers.anthropic) {
  console.log('\n⚠️  WARNING: Anthropic also found in whisper.providers (should be removed)');
}

console.log('\n=== Verification Complete ===');
