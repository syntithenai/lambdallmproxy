#!/usr/bin/env node

/**
 * Update costEffective and costEffectiveDesc keys in all language files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.join(__dirname, '../src/i18n/locales');

// Translations for the updated keys
const translations = {
  es: {
    costEffective: "Selección Inteligente de Modelos",
    costEffectiveDesc: "Selección automática de modelos que hacen el trabajo de manera económica o potente según la estrategia de selección. Trae tus propias claves para ahorrar un 25%"
  },
  fr: {
    costEffective: "Sélection Intelligente de Modèles",
    costEffectiveDesc: "Sélection automatique de modèles qui font le travail de manière économique ou puissante selon la stratégie de sélection. Apportez vos propres clés pour économiser 25%"
  },
  de: {
    costEffective: "Intelligente Modellauswahl",
    costEffectiveDesc: "Automatische Auswahl von Modellen, die die Aufgabe wirtschaftlich oder leistungsstark erledigen, basierend auf der Auswahlstrategie. Verwenden Sie Ihre eigenen Schlüssel, um 25% zu sparen"
  },
  nl: {
    costEffective: "Slimme Modelselectie",
    costEffectiveDesc: "Automatische selectie van modellen die het werk economisch of krachtig uitvoeren op basis van de selectiestrategie. Gebruik je eigen sleutels om 25% te besparen"
  },
  pt: {
    costEffective: "Seleção Inteligente de Modelos",
    costEffectiveDesc: "Seleção automática de modelos que fazem o trabalho de forma econômica ou poderosa com base na estratégia de seleção. Traga suas próprias chaves para economizar 25%"
  },
  ru: {
    costEffective: "Интеллектуальный Выбор Моделей",
    costEffectiveDesc: "Автоматический выбор моделей, которые выполняют работу экономично или мощно на основе стратегии выбора. Используйте свои собственные ключи, чтобы сэкономить 25%"
  },
  zh: {
    costEffective: "智能模型选择",
    costEffectiveDesc: "根据选择策略自动选择经济高效或功能强大的模型。使用您自己的密钥可节省25%"
  },
  ja: {
    costEffective: "スマートモデル選択",
    costEffectiveDesc: "選択戦略に基づいて、経済的またはパワフルにジョブを実行するモデルを自動選択。独自のキーを使用すると25%節約"
  },
  ar: {
    costEffective: "اختيار نموذج ذكي",
    costEffectiveDesc: "اختيار تلقائي للنماذج التي تنجز المهمة بشكل اقتصادي أو قوي بناءً على استراتيجية الاختيار. أحضر مفاتيحك الخاصة لتوفير 25%"
  }
};

// Update each language file
const languages = ['es', 'fr', 'de', 'nl', 'pt', 'ru', 'zh', 'ja', 'ar'];

for (const lang of languages) {
  const langPath = path.join(LOCALES_DIR, `${lang}.json`);
  const langData = JSON.parse(fs.readFileSync(langPath, 'utf-8'));
  
  // Update the two keys in auth namespace
  langData.auth.costEffective = translations[lang].costEffective;
  langData.auth.costEffectiveDesc = translations[lang].costEffectiveDesc;
  
  // Write back
  fs.writeFileSync(langPath, JSON.stringify(langData, null, 2) + '\n', 'utf-8');
  console.log(`✅ Updated ${lang}.json with new costEffective keys`);
}

console.log('\n✨ All language files updated successfully!');
