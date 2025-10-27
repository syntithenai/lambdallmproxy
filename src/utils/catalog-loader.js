/**
 * Catalog Loader Utility
 * 
 * Centralized loader for JSON catalog files (PROVIDER_CATALOG, EMBEDDING_MODELS_CATALOG)
 * Handles multiple possible paths for local development and Lambda deployment
 * Caches results to avoid repeated file system reads
 */

const path = require('path');

let cachedProviderCatalog = null;
let cachedEmbeddingCatalog = null;

/**
 * Load provider catalog with fallback paths
 * Tries multiple locations and caches result for subsequent calls
 * 
 * @returns {Object} Provider catalog data
 * @throws {Error} If catalog cannot be loaded from any location
 * 
 * @example
 * const catalog = loadProviderCatalog();
 * const groqProvider = catalog.providers.find(p => p.id === 'groq');
 */
function loadProviderCatalog() {
  if (cachedProviderCatalog) {
    return cachedProviderCatalog;
  }
  
  const possiblePaths = [
    // Relative path from this file (src/utils/catalog-loader.js)
    path.join(__dirname, '..', '..', 'PROVIDER_CATALOG.json'),
    // Lambda /var/task root
    '/var/task/PROVIDER_CATALOG.json',
    // Current working directory
    path.join(process.cwd(), 'PROVIDER_CATALOG.json')
  ];
  
  for (const catalogPath of possiblePaths) {
    try {
      cachedProviderCatalog = require(catalogPath);
      console.log(`✅ Loaded provider catalog from: ${catalogPath}`);
      return cachedProviderCatalog;
    } catch (error) {
      // Try next path
      continue;
    }
  }
  
  throw new Error('Failed to load PROVIDER_CATALOG.json from any known location. Tried: ' + possiblePaths.join(', '));
}

/**
 * Load embedding models catalog with fallback paths
 * Tries multiple locations and caches result for subsequent calls
 * 
 * @returns {Object} Embedding catalog data
 * @throws {Error} If catalog cannot be loaded from any location
 * 
 * @example
 * const catalog = loadEmbeddingCatalog();
 * const openaiModels = catalog.providers.find(p => p.id === 'openai').models;
 */
function loadEmbeddingCatalog() {
  if (cachedEmbeddingCatalog) {
    return cachedEmbeddingCatalog;
  }
  
  const possiblePaths = [
    // Relative path from this file (src/utils/catalog-loader.js)
    path.join(__dirname, '..', '..', 'EMBEDDING_MODELS_CATALOG.json'),
    // Lambda /var/task root
    '/var/task/EMBEDDING_MODELS_CATALOG.json',
    // Current working directory
    path.join(process.cwd(), 'EMBEDDING_MODELS_CATALOG.json')
  ];
  
  for (const catalogPath of possiblePaths) {
    try {
      cachedEmbeddingCatalog = require(catalogPath);
      console.log(`✅ Loaded embedding catalog from: ${catalogPath}`);
      return cachedEmbeddingCatalog;
    } catch (error) {
      // Try next path
      continue;
    }
  }
  
  throw new Error('Failed to load EMBEDDING_MODELS_CATALOG.json from any known location. Tried: ' + possiblePaths.join(', '));
}

/**
 * Clear cached catalogs (for testing or hot-reload scenarios)
 * Forces next call to reload from filesystem
 */
function clearCatalogCache() {
  cachedProviderCatalog = null;
  cachedEmbeddingCatalog = null;
  console.log('📦 Catalog cache cleared');
}

module.exports = {
  loadProviderCatalog,
  loadEmbeddingCatalog,
  clearCatalogCache
};
