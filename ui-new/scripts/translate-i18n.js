#!/usr/bin/env node

/**
 * Translation script for i18n files
 * Translates en.json to all target languages
 * 
 * Usage: node translate-i18n.js [language-code]
 * Example: node translate-i18n.js es
 * Or: node translate-i18n.js (translates all)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.join(__dirname, '../src/i18n/locales');
const SOURCE_LANG = 'en';

// Target languages with their full names
const TARGET_LANGUAGES = {
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  nl: 'Dutch',
  pt: 'Portuguese',
  ru: 'Russian',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ar: 'Arabic'
};

// Manual translations for common terms (to ensure consistency)
const MANUAL_TRANSLATIONS = {
  common: {
    es: {
      save: 'Guardar',
      cancel: 'Cancelar',
      delete: 'Eliminar',
      edit: 'Editar',
      close: 'Cerrar',
      loading: 'Cargando...',
      error: 'Error',
      success: 'Éxito',
      confirm: 'Confirmar',
      back: 'Atrás',
      next: 'Siguiente',
      submit: 'Enviar',
      clear: 'Limpiar',
      search: 'Buscar',
      filter: 'Filtrar',
      export: 'Exportar',
      import: 'Importar',
      download: 'Descargar',
      upload: 'Subir',
      copy: 'Copiar',
      paste: 'Pegar',
      cut: 'Cortar',
      undo: 'Deshacer',
      redo: 'Rehacer',
      select: 'Seleccionar',
      selectAll: 'Seleccionar todo',
      deselectAll: 'Deseleccionar todo',
      done: 'Hecho'
    }
  }
};

function loadJson(filename) {
  const filePath = path.join(LOCALES_DIR, filename);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return {};
}

function saveJson(filename, data) {
  const filePath = path.join(LOCALES_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`✅ Saved: ${filename}`);
}

function main() {
  const targetLang = process.argv[2];
  
  // Load source (English) translations
  const enTranslations = loadJson('en.json');
  
  console.log('📋 i18n Translation Helper');
  console.log('==========================\n');
  console.log(`Source file: en.json (${Object.keys(enTranslations).length} namespaces)`);
  console.log(`Target languages: ${Object.keys(TARGET_LANGUAGES).join(', ')}\n`);
  
  if (targetLang) {
    if (!TARGET_LANGUAGES[targetLang]) {
      console.error(`❌ Invalid language code: ${targetLang}`);
      console.error(`Valid codes: ${Object.keys(TARGET_LANGUAGES).join(', ')}`);
      process.exit(1);
    }
    console.log(`🎯 Translating to: ${TARGET_LANGUAGES[targetLang]} (${targetLang})\n`);
  } else {
    console.log('🌐 No language specified - showing translation status for all languages\n');
  }
  
  // Count total keys in source
  let totalKeys = 0;
  function countKeys(obj) {
    let count = 0;
    for (const key in obj) {
      if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        count += countKeys(obj[key]);
      } else {
        count++;
      }
    }
    return count;
  }
  totalKeys = countKeys(enTranslations);
  console.log(`📊 Total translation keys in en.json: ${totalKeys}\n`);
  
  // Check translation status for each language
  const languagesToProcess = targetLang ? [targetLang] : Object.keys(TARGET_LANGUAGES);
  
  languagesToProcess.forEach(lang => {
    const langTranslations = loadJson(`${lang}.json`);
    const langKeys = countKeys(langTranslations);
    const percentage = Math.round((langKeys / totalKeys) * 100);
    const status = percentage === 100 ? '✅' : percentage > 0 ? '⚠️' : '❌';
    
    console.log(`${status} ${TARGET_LANGUAGES[lang]} (${lang}): ${langKeys}/${totalKeys} keys (${percentage}%)`);
    
    if (percentage < 100) {
      console.log(`   → Missing: ${totalKeys - langKeys} keys`);
    }
  });
  
  console.log('\n📝 Translation Instructions:');
  console.log('================================');
  console.log('To translate this file, you can use one of these approaches:\n');
  console.log('1. Professional Translation Service:');
  console.log('   - Export en.json to a translation platform (Lokalise, Crowdin, POEditor)');
  console.log('   - Import translated files back to this directory\n');
  console.log('2. AI Translation:');
  console.log('   - Use Claude/GPT to translate en.json in batches');
  console.log('   - Review and refine translations for accuracy\n');
  console.log('3. Manual Translation:');
  console.log('   - Copy en.json to each language file');
  console.log('   - Translate values manually (keep keys in English)\n');
  console.log('⚠️  IMPORTANT: Always keep translation keys in English!');
  console.log('   Only translate the VALUES, not the KEYS.\n');
  console.log('Example:');
  console.log('  ✅ Correct:   "save": "Guardar"  (key stays "save")');
  console.log('  ❌ Incorrect: "guardar": "Guardar" (key changed)\n');
}

main();
