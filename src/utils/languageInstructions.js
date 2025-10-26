/**
 * Language Instructions for LLM Responses
 * 
 * Provides language-specific instructions to inject into system prompts
 * to ensure LLM responses are in the user's selected language.
 */

function getLanguageInstruction(langCode) {
  const instructions = {
    'en': 'Always respond in English.',
    'es': 'Siempre responde en español.',
    'fr': 'Répondez toujours en français.',
    'de': 'Antworte immer auf Deutsch.',
    'zh': '始终用中文回复。',
    'ja': '常に日本語で応答してください。',
    'ar': 'قم دائمًا بالرد باللغة العربية.'
  };
  
  return instructions[langCode] || instructions['en'];
}

function getLanguageName(langCode) {
  const names = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ar': 'Arabic'
  };
  
  return names[langCode] || 'English';
}

module.exports = {
  getLanguageInstruction,
  getLanguageName
};
