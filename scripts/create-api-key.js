#!/usr/bin/env node
/**
 * Create API Key Script
 * 
 * Usage:
 *   node scripts/create-api-key.js user@example.com [keyName]
 * 
 * Examples:
 *   node scripts/create-api-key.js alice@example.com
 *   node scripts/create-api-key.js bob@example.com "Production API Key"
 */

require('dotenv').config();
const { createAPIKey } = require('../src/services/api-key-manager');

async function main() {
    const userEmail = process.argv[2];
    const keyName = process.argv[3] || 'Default';
    const tier = process.argv[4] || 'free';
    
    if (!userEmail) {
        console.error('❌ Usage: node scripts/create-api-key.js <email> [keyName] [tier]');
        console.error('');
        console.error('Arguments:');
        console.error('  email    - User email address (required)');
        console.error('  keyName  - Descriptive name for the key (optional, default: "Default")');
        console.error('  tier     - Tier level: free, pro, enterprise (optional, default: "free")');
        console.error('');
        console.error('Examples:');
        console.error('  node scripts/create-api-key.js alice@example.com');
        console.error('  node scripts/create-api-key.js bob@example.com "Production API Key"');
        console.error('  node scripts/create-api-key.js charlie@example.com "Dev Key" pro');
        process.exit(1);
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
        console.error('❌ Invalid email format:', userEmail);
        process.exit(1);
    }
    
    // Validate tier
    const validTiers = ['free', 'pro', 'enterprise'];
    if (!validTiers.includes(tier)) {
        console.error('❌ Invalid tier:', tier);
        console.error('   Valid tiers:', validTiers.join(', '));
        process.exit(1);
    }
    
    try {
        console.log('🔑 Creating API key...');
        console.log('   Email:', userEmail);
        console.log('   Name:', keyName);
        console.log('   Tier:', tier);
        console.log('');
        
        const result = await createAPIKey(userEmail, keyName, tier);
        
        console.log('✅ API Key created successfully!');
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📧 User:     ', result.userEmail);
        console.log('🔑 API Key:  ', result.apiKey);
        console.log('📝 Name:     ', result.keyName);
        console.log('⚡ Tier:     ', result.tier);
        console.log('🕐 Created:  ', result.createdAt);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log('⚠️  IMPORTANT: Save this key! It will not be shown again.');
        console.log('');
        console.log('Test the key:');
        console.log('  curl http://localhost:3000/v1/models \\');
        console.log(`    -H "Authorization: Bearer ${result.apiKey}"`);
        console.log('');
    } catch (error) {
        console.error('❌ Error creating API key:', error.message);
        console.error('');
        console.error('Troubleshooting:');
        console.error('  1. Check that .env file exists and has:');
        console.error('     - GS_SHEET_ID (Google Sheets spreadsheet ID)');
        console.error('     - GS_EMAIL (Service account email)');
        console.error('     - GS_KEY (Service account private key)');
        console.error('  2. Verify service account has access to the spreadsheet');
        console.error('  3. Check CloudWatch logs for detailed error info');
        console.error('');
        console.error('Full error:', error.stack);
        process.exit(1);
    }
}

main();
