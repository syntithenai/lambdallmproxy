#!/usr/bin/env node

/**
 * Bulk Translation Generator
 * 
 * This script copies the English master file to all target languages,
 * preserving existing translations and marking untranslated keys with [TODO] prefix.
 * 
 * Usage:
 *   node scripts/bulk-translate-prepare.js
 * 
 * After running this:
 * 1. Use DeepL API/GPT-4 to translate [TODO] marked strings
 * 2. Remove [TODO] prefix after translation
 * 3. Run translate-i18n.js to verify completion
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localesDir = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const enPath = path.join(localesDir, 'en.json');
const esPath = path.join(localesDir, 'es.json');

// Load English and Spanish (complete) files
const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const esData = JSON.parse(fs.readFileSync(esPath, 'utf8'));

// Target languages (excluding English and Spanish which are complete)
const targetLanguages = [
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ar', name: 'Arabic' }
];

// Recursively merge translations
function mergeTranslations(english, existing) {
  const result = {};
  
  for (const [key, value] of Object.entries(english)) {
    if (typeof value === 'object' && value !== null) {
      // Nested object - recurse
      result[key] = mergeTranslations(value, existing[key] || {});
    } else {
      // Check if translation exists
      if (existing[key] && existing[key] !== value) {
        // Use existing translation
        result[key] = existing[key];
      } else {
        // Mark as needing translation
        result[key] = `[TODO] ${value}`;
      }
    }
  }
  
  return result;
}

// Count TODO markers
function countTodos(obj) {
  let count = 0;
  
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null) {
      count += countTodos(value);
    } else if (typeof value === 'string' && value.startsWith('[TODO]')) {
      count++;
    }
  }
  
  return count;
}

console.log('🌍 Bulk Translation Preparation\n');
console.log('================================\n');

for (const { code, name } of targetLanguages) {
  const langPath = path.join(localesDir, `${code}.json`);
  
  // Load existing translations
  let existingData = {};
  try {
    existingData = JSON.parse(fs.readFileSync(langPath, 'utf8'));
  } catch (e) {
    console.log(`⚠️  ${name} (${code}): No existing file, creating new...`);
  }
  
  // Merge with English, marking untranslated strings
  const merged = mergeTranslations(enData, existingData);
  
  // Count pending translations
  const todoCount = countTodos(merged);
  const totalKeys = 573;
  const translatedCount = totalKeys - todoCount;
  const percentage = Math.round((translatedCount / totalKeys) * 100);
  
  // Write file
  fs.writeFileSync(langPath, JSON.stringify(merged, null, 2), 'utf8');
  
  console.log(`✅ ${name} (${code}.json):`);
  console.log(`   ${translatedCount}/${totalKeys} keys (${percentage}%)`);
  console.log(`   ${todoCount} keys marked [TODO] for translation\n`);
}

console.log('\n📋 Next Steps:\n');
console.log('1. Choose translation method:');
console.log('   a) AI Translation: Use DeepL API or GPT-4 to translate [TODO] strings');
console.log('   b) Professional: Export to Lokalise/Crowdin for human translation');
console.log('   c) Manual: Search for "[TODO]" and translate each string\n');
console.log('2. Remove [TODO] prefix after translating each string\n');
console.log('3. Verify: Run `node scripts/translate-i18n.js` to check progress\n');
console.log('4. Test: Switch languages in UI to verify translations display correctly\n');
console.log('💡 Tip: Start with high-priority languages (French, German) first!\n');
