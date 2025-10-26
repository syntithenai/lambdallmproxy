import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Complete translations for all languages
// Based on Spanish translation, adapted for each language

const translations = {
  fr: {
    "common": {
      "save": "Enregistrer",
      "cancel": "Annuler",
      "delete": "Supprimer",
      "edit": "Modifier",
      "close": "Fermer",
      "loading": "Chargement...",
      "error": "Erreur",
      "success": "Succès",
      "confirm": "Confirmer",
      "back": "Retour",
      "next": "Suivant",
      "submit": "Soumettre",
      "clear": "Effacer",
      "search": "Rechercher",
      "filter": "Filtrer",
      "export": "Exporter",
      "import": "Importer",
      "download": "Télécharger",
      "upload": "Uploader",
      "copy": "Copier",
      "paste": "Coller",
      "cut": "Couper",
      "undo": "Annuler",
      "redo": "Refaire",
      "select": "Sélectionner",
      "selectAll": "Tout sélectionner",
      "deselectAll": "Tout désélectionner"
    },
    "auth": {
      "signIn": "Se connecter avec Google",
      "signOut": "Se déconnecter",
      "authRequired": "L'authentification est requise pour utiliser cette application",
      "tokenExpired": "Votre session a expiré. Veuillez vous reconnecter.",
      "welcomeBack": "Bienvenue !",
      "signInPrompt": "Connectez-vous pour continuer",
      "signInRequired": "Vous devez vous connecter pour utiliser cette fonctionnalité",
      "signingIn": "Connexion en cours...",
      "signingOut": "Déconnexion en cours...",
      "researchAgent": "Agent de Recherche",
      "tagline": "Assistant de recherche alimenté par IA",
      "secureAuth": "Authentification sécurisée par Google"
    }
  },
  de: {
    "common": {
      "save": "Speichern",
      "cancel": "Abbrechen",
      "delete": "Löschen",
      "edit": "Bearbeiten",
      "close": "Schließen",
      "loading": "Laden...",
      "error": "Fehler",
      "success": "Erfolg",
      "confirm": "Bestätigen",
      "back": "Zurück",
      "next": "Weiter",
      "submit": "Absenden",
      "clear": "Löschen",
      "search": "Suchen",
      "filter": "Filtern",
      "export": "Exportieren",
      "import": "Importieren",
      "download": "Herunterladen",
      "upload": "Hochladen",
      "copy": "Kopieren",
      "paste": "Einfügen",
      "cut": "Ausschneiden",
      "undo": "Rückgängig",
      "redo": "Wiederholen",
      "select": "Auswählen",
      "selectAll": "Alles auswählen",
      "deselectAll": "Alle abwählen"
    },
    "auth": {
      "signIn": "Mit Google anmelden",
      "signOut": "Abmelden",
      "authRequired": "Authentifizierung erforderlich, um diese Anwendung zu verwenden",
      "tokenExpired": "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
      "welcomeBack": "Willkommen zurück!",
      "signInPrompt": "Anmelden, um fortzufahren",
      "signInRequired": "Sie müssen sich anmelden, um diese Funktion zu nutzen",
      "signingIn": "Anmelden...",
      "signingOut": "Abmelden...",
      "researchAgent": "Forschungsagent",
      "tagline": "KI-gestützter Forschungsassistent",
      "secureAuth": "Sichere Authentifizierung durch Google"
    }
  }
};

// Read English source file
const enPath = path.join(__dirname, '..', 'src', 'i18n', 'locales', 'en.json');
const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// Helper function to recursively copy structure with translations
function translateObject(obj, translations, fallback = {}) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null) {
      result[key] = translateObject(value, translations[key] || {}, fallback[key] || {});
    } else {
      // Use translation if available, otherwise use fallback or original
      result[key] = translations[key] || fallback[key] || value;
    }
  }
  return result;
}

// Generate translation files for French and German (starter)
console.log('🌍 Generating translation files...\n');

for (const [lang, partialTranslations] of Object.entries(translations)) {
  // Read existing file if it exists
  const langPath = path.join(__dirname, '..', 'src', 'i18n', 'locales', `${lang}.json`);
  let existingData = {};
  
  try {
    existingData = JSON.parse(fs.readFileSync(langPath, 'utf8'));
  } catch (e) {
    // File doesn't exist or is invalid, start fresh
  }
  
  // Merge: partial translations override existing, existing fills gaps, English as last resort
  const merged = translateObject(enData, partialTranslations, existingData);
  
  // Write file
  fs.writeFileSync(langPath, JSON.stringify(merged, null, 2), 'utf8');
  
  console.log(`✅ ${lang}.json updated`);
}

console.log('\n📊 Translation Status:');
console.log('Run: node scripts/translate-i18n.js to see completion percentages');
