#!/usr/bin/env node

/**
 * AI-Assisted Translation Script
 * 
 * This script translates TODO-marked strings from English to target languages
 * using pattern-based translation (derived from Spanish reference).
 * 
 * Translation approach:
 * 1. Common UI terms (Save, Cancel, etc.) - Direct dictionary
 * 2. Complex strings - Keep English temporarily with [AI-NEEDED] marker
 * 3. Interpolation {{}} preserved exactly
 * 
 * Run after: bulk-translate-prepare.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Common translation dictionaries (expanded from known translations)
const dictionaries = {
  fr: {
    // Common actions
    "Confirm": "Confirmer",
    "Back": "Retour",
    "Next": "Suivant",
    "Submit": "Soumettre",
    "Clear": "Effacer",
    "Search": "Rechercher",
    "Filter": "Filtrer",
    "Export": "Exporter",
    "Import": "Importer",
    "Download": "Télécharger",
    "Upload": "Téléverser",
    "Copy": "Copier",
    "Paste": "Coller",
    "Cut": "Couper",
    "Undo": "Annuler",
    "Redo": "Refaire",
    "Select": "Sélectionner",
    "Select All": "Tout sélectionner",
    "Deselect All": "Tout désélectionner",
    "Retry": "Réessayer",
    "Generating response...": "Génération de la réponse...",
    "New Chat": "Nouveau Chat",
    "Clear History": "Effacer l'historique",
    "Load Chat": "Charger le chat",
    "System Prompt": "Instruction système",
    "Custom Instructions": "Instructions personnalisées",
    "Temperature": "Température",
    "Max Tokens": "Tokens maximum",
    "Model": "Modèle",
    "Provider": "Fournisseur",
    "Chat History": "Historique du chat",
    "Continue": "Continuer",
    "Regenerate": "Régénérer",
    "Copied!": "Copié !",
    "Select Files": "Sélectionner des fichiers",
    "Attach Files": "Joindre des fichiers",
    "Paste Image": "Coller une image",
    "Recording...": "Enregistrement...",
    "Voice Input": "Entrée vocale",
    "Stop Recording": "Arrêter l'enregistrement",
    "Processing...": "Traitement...",
    "Loading...": "Chargement...",
    "Title": "Titre",
    "Settings": "Paramètres",
    "Language": "Langue",
    "Loading": "Chargement",
    "Error": "Erreur",
    "Success": "Succès"
  },
  de: {
    "Confirm": "Bestätigen",
    "Back": "Zurück",
    "Next": "Weiter",
    "Submit": "Absenden",
    "Clear": "Löschen",
    "Search": "Suchen",
    "Filter": "Filtern",
    "Export": "Exportieren",
    "Import": "Importieren",
    "Download": "Herunterladen",
    "Upload": "Hochladen",
    "Copy": "Kopieren",
    "Paste": "Einfügen",
    "Cut": "Ausschneiden",
    "Undo": "Rückgängig",
    "Redo": "Wiederholen",
    "Select": "Auswählen",
    "Select All": "Alles auswählen",
    "Deselect All": "Alle abwählen",
    "Retry": "Wiederholen",
    "Generating response...": "Antwort wird generiert...",
    "New Chat": "Neuer Chat",
    "Clear History": "Verlauf löschen",
    "Load Chat": "Chat laden",
    "System Prompt": "Systemaufforderung",
    "Custom Instructions": "Benutzerdefinierte Anweisungen",
    "Temperature": "Temperatur",
    "Max Tokens": "Maximale Tokens",
    "Model": "Modell",
    "Provider": "Anbieter",
    "Chat History": "Chat-Verlauf",
    "Continue": "Fortsetzen",
    "Regenerate": "Neu generieren",
    "Copied!": "Kopiert!",
    "Select Files": "Dateien auswählen",
    "Attach Files": "Dateien anhängen",
    "Paste Image": "Bild einfügen",
    "Recording...": "Aufnahme...",
    "Voice Input": "Spracheingabe",
    "Stop Recording": "Aufnahme stoppen",
    "Processing...": "Verarbeitung...",
    "Loading...": "Laden...",
    "Title": "Titel",
    "Settings": "Einstellungen",
    "Language": "Sprache",
    "Loading": "Laden",
    "Error": "Fehler",
    "Success": "Erfolg"
  },
  nl: {
    "Confirm": "Bevestigen",
    "Back": "Terug",
    "Next": "Volgende",
    "Submit": "Indienen",
    "Clear": "Wissen",
    "Search": "Zoeken",
    "Filter": "Filteren",
    "Export": "Exporteren",
    "Import": "Importeren",
    "Download": "Downloaden",
    "Upload": "Uploaden",
    "Copy": "Kopiëren",
    "Paste": "Plakken",
    "Cut": "Knippen",
    "Undo": "Ongedaan maken",
    "Redo": "Opnieuw",
    "Select": "Selecteren",
    "Select All": "Alles selecteren",
    "Deselect All": "Alles deselecteren"
  },
  pt: {
    "Confirm": "Confirmar",
    "Back": "Voltar",
    "Next": "Próximo",
    "Submit": "Enviar",
    "Clear": "Limpar",
    "Search": "Pesquisar",
    "Filter": "Filtrar",
    "Export": "Exportar",
    "Import": "Importar",
    "Download": "Baixar",
    "Upload": "Enviar",
    "Copy": "Copiar",
    "Paste": "Colar",
    "Cut": "Cortar",
    "Undo": "Desfazer",
    "Redo": "Refazer",
    "Select": "Selecionar",
    "Select All": "Selecionar tudo",
    "Deselect All": "Desselecionar tudo"
  },
  ru: {
    "Confirm": "Подтвердить",
    "Back": "Назад",
    "Next": "Далее",
    "Submit": "Отправить",
    "Clear": "Очистить",
    "Search": "Поиск",
    "Filter": "Фильтр",
    "Export": "Экспорт",
    "Import": "Импорт",
    "Download": "Скачать",
    "Upload": "Загрузить",
    "Copy": "Копировать",
    "Paste": "Вставить",
    "Cut": "Вырезать",
    "Undo": "Отменить",
    "Redo": "Повторить",
    "Select": "Выбрать",
    "Select All": "Выбрать всё",
    "Deselect All": "Снять выделение"
  },
  zh: {
    "Confirm": "确认",
    "Back": "返回",
    "Next": "下一个",
    "Submit": "提交",
    "Clear": "清除",
    "Search": "搜索",
    "Filter": "筛选",
    "Export": "导出",
    "Import": "导入",
    "Download": "下载",
    "Upload": "上传",
    "Copy": "复制",
    "Paste": "粘贴",
    "Cut": "剪切",
    "Undo": "撤销",
    "Redo": "重做",
    "Select": "选择",
    "Select All": "全选",
    "Deselect All": "取消全选"
  },
  ja: {
    "Confirm": "確認",
    "Back": "戻る",
    "Next": "次へ",
    "Submit": "送信",
    "Clear": "クリア",
    "Search": "検索",
    "Filter": "フィルター",
    "Export": "エクスポート",
    "Import": "インポート",
    "Download": "ダウンロード",
    "Upload": "アップロード",
    "Copy": "コピー",
    "Paste": "貼り付け",
    "Cut": "切り取り",
    "Undo": "元に戻す",
    "Redo": "やり直し",
    "Select": "選択",
    "Select All": "すべて選択",
    "Deselect All": "すべて選択解除"
  },
  ar: {
    "Confirm": "تأكيد",
    "Back": "رجوع",
    "Next": "التالي",
    "Submit": "إرسال",
    "Clear": "مسح",
    "Search": "بحث",
    "Filter": "تصفية",
    "Export": "تصدير",
    "Import": "استيراد",
    "Download": "تحميل",
    "Upload": "رفع",
    "Copy": "نسخ",
    "Paste": "لصق",
    "Cut": "قص",
    "Undo": "تراجع",
    "Redo": "إعادة",
    "Select": "تحديد",
    "Select All": "تحديد الكل",
    "Deselect All": "إلغاء تحديد الكل"
  }
};

// Translate a TODO-marked value
function translateValue(value, dict) {
  if (!value.startsWith('[TODO]')) {
    return value; // Already translated
  }
  
  const english = value.replace('[TODO] ', '');
  
  // Check dictionary
  if (dict[english]) {
    return dict[english];
  }
  
  // If not in dictionary, mark for AI translation
  return `[AI-NEEDED] ${english}`;
}

// Recursively translate object
function translateObject(obj, dict) {
  const result = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null) {
      result[key] = translateObject(value, dict);
    } else if (typeof value === 'string') {
      result[key] = translateValue(value, dict);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

// Count markers
function countMarkers(obj, marker) {
  let count = 0;
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null) {
      count += countMarkers(value, marker);
    } else if (typeof value === 'string' && value.startsWith(marker)) {
      count++;
    }
  }
  return count;
}

// Process all languages
console.log('🤖 AI-Assisted Translation\n');
console.log('===========================\n');

for (const [lang, dict] of Object.entries(dictionaries)) {
  const langPath = path.join(__dirname, '..', 'src', 'i18n', 'locales', `${lang}.json`);
  
  // Load file
  const data = JSON.parse(fs.readFileSync(langPath, 'utf8'));
  
  // Count before
  const todoBefore = countMarkers(data, '[TODO]');
  
  // Translate
  const translated = translateObject(data, dict);
  
  // Count after
  const todoAfter = countMarkers(translated, '[TODO]');
  const aiNeeded = countMarkers(translated, '[AI-NEEDED]');
  const completed = todoBefore - todoAfter - aiNeeded;
  
  // Write back
  fs.writeFileSync(langPath, JSON.stringify(translated, null, 2), 'utf8');
  
  console.log(`✅ ${lang}.json:`);
  console.log(`   Translated: ${completed} strings`);
  console.log(`   AI needed: ${aiNeeded} complex strings`);
  console.log(`   TODO remaining: ${todoAfter}\n`);
}

console.log('\n📋 Next Steps:\n');
console.log('1. Review [AI-NEEDED] strings - these are complex and need AI/human translation');
console.log('2. Use DeepL/GPT-4 API to translate [AI-NEEDED] strings in batch');
console.log('3. Replace [AI-NEEDED] prefix with actual translation');
console.log('4. Run `node scripts/translate-i18n.js` to verify 100% completion\n');
