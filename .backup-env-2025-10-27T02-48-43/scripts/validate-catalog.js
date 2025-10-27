#!/usr/bin/env node
/**
 * Validate PROVIDER_CATALOG.json structure
 * 
 * Ensures the catalog has the required structure for Phase 2+ implementation
 */

const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, '..', 'PROVIDER_CATALOG.json');

console.log('🔍 Validating PROVIDER_CATALOG.json...\n');

try {
    // Read and parse catalog
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    
    let errors = [];
    let warnings = [];
    
    // Validate top-level structure
    if (!catalog.version) errors.push('Missing version field');
    if (!catalog.lastUpdated) errors.push('Missing lastUpdated field');
    if (!catalog.providers) errors.push('Missing providers field');
    
    // Validate providers
    const requiredProviders = ['groq', 'openai', 'gemini', 'cohere', 'mistral'];
    requiredProviders.forEach(provider => {
        if (!catalog.providers[provider]) {
            errors.push(`Missing provider: ${provider}`);
        }
    });
    
    // Validate provider structure
    Object.entries(catalog.providers).forEach(([name, provider]) => {
        if (!provider.name) errors.push(`${name}: Missing name`);
        if (!provider.type) errors.push(`${name}: Missing type`);
        if (!provider.apiBase) errors.push(`${name}: Missing apiBase`);
        if (provider.supportsStreaming === undefined) warnings.push(`${name}: Missing supportsStreaming`);
        if (!provider.freeTier) errors.push(`${name}: Missing freeTier`);
        if (!provider.models) errors.push(`${name}: Missing models`);
        
        // Validate models
        if (provider.models) {
            const modelCount = Object.keys(provider.models).length;
            if (modelCount === 0) warnings.push(`${name}: No models defined`);
            
            Object.entries(provider.models).forEach(([modelId, model]) => {
                if (!model.id) errors.push(`${name}/${modelId}: Missing id`);
                if (!model.category) errors.push(`${name}/${modelId}: Missing category`);
                if (!['small', 'large', 'reasoning'].includes(model.category)) {
                    errors.push(`${name}/${modelId}: Invalid category: ${model.category}`);
                }
                if (!model.contextWindow) warnings.push(`${name}/${modelId}: Missing contextWindow`);
                if (!model.pricing) errors.push(`${name}/${modelId}: Missing pricing`);
                if (model.pricing && (!model.pricing.input && model.pricing.input !== 0)) {
                    errors.push(`${name}/${modelId}: Missing pricing.input`);
                }
            });
        }
    });
    
    // Validate free tier providers
    const freeProviders = Object.entries(catalog.providers)
        .filter(([_, p]) => p.freeTier && p.freeTier.available)
        .map(([name, _]) => name);
    
    if (freeProviders.length < 2) {
        warnings.push(`Only ${freeProviders.length} free tier provider(s) found. Expected at least 2 for redundancy.`);
    }
    
    // Validate OpenAI-compatible endpoints
    if (!catalog.openaiCompatibleEndpoints) {
        warnings.push('Missing openaiCompatibleEndpoints field');
    } else if (catalog.openaiCompatibleEndpoints.length < 5) {
        warnings.push(`Only ${catalog.openaiCompatibleEndpoints.length} OpenAI-compatible endpoints. Expected at least 5.`);
    }
    
    // Validate Whisper support
    if (!catalog.whisperSupport) {
        warnings.push('Missing whisperSupport field');
    }
    
    // Validate model categories
    if (!catalog.modelCategories) {
        warnings.push('Missing modelCategories field');
    }
    
    // Summary
    const totalModels = Object.values(catalog.providers)
        .reduce((sum, p) => sum + Object.keys(p.models || {}).length, 0);
    
    console.log('📊 Catalog Statistics:');
    console.log(`   Version: ${catalog.version}`);
    console.log(`   Last Updated: ${catalog.lastUpdated}`);
    console.log(`   Providers: ${Object.keys(catalog.providers).length}`);
    console.log(`   Total Models: ${totalModels}`);
    console.log(`   Free Tier Providers: ${freeProviders.join(', ')}`);
    console.log(`   OpenAI-Compatible Endpoints: ${(catalog.openaiCompatibleEndpoints || []).length}`);
    
    console.log('\n📋 Model Breakdown:');
    Object.entries(catalog.providers).forEach(([name, provider]) => {
        const models = provider.models || {};
        const small = Object.values(models).filter(m => m.category === 'small').length;
        const large = Object.values(models).filter(m => m.category === 'large').length;
        const reasoning = Object.values(models).filter(m => m.category === 'reasoning').length;
        const freeTier = provider.freeTier?.available ? '🆓' : '💰';
        
        console.log(`   ${freeTier} ${provider.name}: ${small} small, ${large} large, ${reasoning} reasoning`);
    });
    
    // Report results
    console.log('\n' + '='.repeat(50));
    
    if (errors.length > 0) {
        console.log('\n❌ VALIDATION FAILED\n');
        console.log('Errors:');
        errors.forEach(err => console.log(`  - ${err}`));
    } else {
        console.log('\n✅ VALIDATION PASSED\n');
    }
    
    if (warnings.length > 0) {
        console.log('⚠️  Warnings:');
        warnings.forEach(warn => console.log(`  - ${warn}`));
    }
    
    console.log('\n' + '='.repeat(50));
    
    if (errors.length === 0) {
        console.log('\n✨ Catalog is ready for Phase 2 implementation!\n');
        process.exit(0);
    } else {
        process.exit(1);
    }
    
} catch (error) {
    console.error('\n❌ Failed to validate catalog:', error.message);
    process.exit(1);
}
