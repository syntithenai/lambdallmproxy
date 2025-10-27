#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// Load variable mapping
const VARIABLE_MAP = require('./env-variable-map.json');

// Define file patterns to search
const FILE_PATTERNS = [
  'src/**/*.js',
  'ui-new/src/**/*.{ts,tsx}',
  'scripts/**/*.{sh,js}',
  '.env.example'
];

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Create backup of original files
function createBackup() {
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const backupDir = `.backup-env-${timestamp}`;
  
  log(`\n📦 Creating backup...`, 'blue');
  fs.mkdirSync(backupDir, { recursive: true });
  
  let fileCount = 0;
  FILE_PATTERNS.forEach(pattern => {
    const files = glob.sync(pattern, { nodir: true });
    files.forEach(file => {
      const dest = path.join(backupDir, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(file, dest);
      fileCount++;
    });
  });
  
  log(`✅ Backup created: ${backupDir} (${fileCount} files)`, 'green');
  return backupDir;
}

// Escape special regex characters
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Search and replace in files
function replaceInFiles(oldVar, newVar) {
  const results = { files: [], occurrences: 0 };
  
  FILE_PATTERNS.forEach(pattern => {
    const files = glob.sync(pattern, { nodir: true });
    files.forEach(file => {
      let content = fs.readFileSync(file, 'utf8');
      const originalContent = content;
      let fileOccurrences = 0;
      
      // Backend: process.env.OLD_VAR → process.env.NEW_VAR
      const backendRegex = new RegExp(`process\\.env\\.${escapeRegex(oldVar)}\\b`, 'g');
      const backendMatches = content.match(backendRegex);
      if (backendMatches) {
        content = content.replace(backendRegex, `process.env.${newVar}`);
        fileOccurrences += backendMatches.length;
      }
      
      // Frontend: import.meta.env.OLD_VAR → import.meta.env.NEW_VAR
      const frontendRegex = new RegExp(`import\\.meta\\.env\\.${escapeRegex(oldVar)}\\b`, 'g');
      const frontendMatches = content.match(frontendRegex);
      if (frontendMatches) {
        content = content.replace(frontendRegex, `import.meta.env.${newVar}`);
        fileOccurrences += frontendMatches.length;
      }
      
      // .env file: OLD_VAR= → NEW_VAR=
      if (file.endsWith('.env') || file.endsWith('.env.example')) {
        const envRegex = new RegExp(`^${escapeRegex(oldVar)}=`, 'gm');
        const envMatches = content.match(envRegex);
        if (envMatches) {
          content = content.replace(envRegex, `${newVar}=`);
          fileOccurrences += envMatches.length;
        }
        
        // Also update comments referencing the variable
        const commentRegex = new RegExp(`# (Previously: )?${escapeRegex(oldVar)}\\b`, 'g');
        content = content.replace(commentRegex, `# Previously: ${oldVar}`);
      }
      
      // Shell scripts: ${OLD_VAR} → ${NEW_VAR}
      if (file.endsWith('.sh')) {
        const shellRegex1 = new RegExp(`\\$\\{${escapeRegex(oldVar)}\\}`, 'g');
        const shellMatches1 = content.match(shellRegex1);
        if (shellMatches1) {
          content = content.replace(shellRegex1, `\${${newVar}}`);
          fileOccurrences += shellMatches1.length;
        }
        
        const shellRegex2 = new RegExp(`\\$${escapeRegex(oldVar)}\\b`, 'g');
        const shellMatches2 = content.match(shellRegex2);
        if (shellMatches2) {
          content = content.replace(shellRegex2, `$${newVar}`);
          fileOccurrences += shellMatches2.length;
        }
      }
      
      if (content !== originalContent) {
        fs.writeFileSync(file, content, 'utf8');
        results.files.push(file);
        results.occurrences += fileOccurrences;
      }
    });
  });
  
  return results;
}

// Handle indexed provider variables
function handleProviderVariables() {
  log('\n🔧 Processing indexed provider variables...', 'blue');
  
  const providerFields = [
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_TYPE_', new: 'P_T' },
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_KEY_', new: 'P_K' },
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_ENDPOINT_', new: 'P_E' },
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_MODEL_', new: 'P_M' },
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_RATE_LIMIT_', new: 'P_RL' },
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_ALLOWED_MODELS_', new: 'P_AM' },
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_IMAGE_MAX_QUALITY_', new: 'P_IQ' },
    { old: 'LLAMDA_LLM_PROXY_PROVIDER_PRIORITY_', new: 'P_P' }
  ];
  
  const maxProviders = 20; // Reasonable upper limit
  const providerResults = [];
  
  providerFields.forEach(field => {
    for (let i = 0; i < maxProviders; i++) {
      const oldVar = `${field.old}${i}`;
      const newVar = `${field.new}${i}`;
      
      const result = replaceInFiles(oldVar, newVar);
      
      if (result.occurrences > 0) {
        log(`   ✅ ${oldVar} → ${newVar}: ${result.occurrences} occurrences in ${result.files.length} files`, 'green');
        providerResults.push({ oldVar, newVar, ...result });
      }
    }
  });
  
  return providerResults;
}

// Verification: Ensure no old variable names remain
function verifyNoOldVariables() {
  log('\n🔍 Running verification...', 'blue');
  const errors = [];
  
  // Get all non-provider variables (providers handled separately)
  const regularVars = Object.keys(VARIABLE_MAP).filter(v => !v.includes('LLAMDA_LLM_PROXY_PROVIDER_'));
  
  regularVars.forEach(oldVar => {
    // Skip VITE_ variables in backend files (they should only be in UI)
    // Skip provider variables (already checked)
    
    FILE_PATTERNS.forEach(pattern => {
      const files = glob.sync(pattern, { nodir: true });
      files.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        
        // Skip VITE_ variables in non-UI files
        if (oldVar.startsWith('VITE_') && !file.includes('ui-new/')) {
          return;
        }
        
        // Skip UI-only variables in backend files
        if (!oldVar.startsWith('VITE_') && file.includes('ui-new/')) {
          return;
        }
        
        // Check for old variable references (but not in comments that say "Previously:")
        const regex = new RegExp(`(?<!Previously: )(process\\.env\\.${escapeRegex(oldVar)}|import\\.meta\\.env\\.${escapeRegex(oldVar)}|\\$\\{?${escapeRegex(oldVar)}\\}?|^${escapeRegex(oldVar)}=)`, 'gm');
        if (regex.test(content)) {
          errors.push({ file, variable: oldVar });
        }
      });
    });
  });
  
  if (errors.length > 0) {
    log('❌ Verification failed! Old variables still found:', 'red');
    errors.forEach(e => log(`   ${e.file}: ${e.variable}`, 'yellow'));
    return false;
  } else {
    log('✅ Verification passed! All variables renamed successfully.', 'green');
    return true;
  }
}

// Main execution
async function main() {
  log('🔧 ENV Variable Compression Tool', 'blue');
  log('=================================\n', 'blue');
  
  // Create backup
  const backupDir = createBackup();
  
  // Track changes
  const changes = [];
  const totalFiles = new Set();
  let totalOccurrences = 0;
  
  log('\n📝 Renaming regular variables...', 'blue');
  
  // Process non-provider variables first
  const regularVars = Object.entries(VARIABLE_MAP).filter(([key]) => !key.includes('LLAMDA_LLM_PROXY_PROVIDER_'));
  
  regularVars.forEach(([oldVar, newVar]) => {
    const result = replaceInFiles(oldVar, newVar);
    
    if (result.occurrences > 0) {
      log(`   ✅ ${oldVar} → ${newVar}: ${result.occurrences} occurrences in ${result.files.length} files`, 'green');
      changes.push({ oldVar, newVar, ...result });
      result.files.forEach(f => totalFiles.add(f));
      totalOccurrences += result.occurrences;
    } else {
      log(`   ⚠️  ${oldVar} → ${newVar}: No occurrences found`, 'gray');
    }
  });
  
  // Process provider variables
  const providerResults = handleProviderVariables();
  providerResults.forEach(result => {
    changes.push(result);
    result.files.forEach(f => totalFiles.add(f));
    totalOccurrences += result.occurrences;
  });
  
  // Generate report
  log('\n📊 Summary Report', 'blue');
  log('=================', 'blue');
  log(`Total Variables Renamed: ${changes.length}`, 'green');
  log(`Total Files Modified: ${totalFiles.size}`, 'green');
  log(`Total Occurrences Replaced: ${totalOccurrences}`, 'green');
  log(`Backup Directory: ${backupDir}`, 'yellow');
  
  // Save detailed report
  const reportPath = `env-compression-report-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(changes, null, 2));
  log(`\n📄 Detailed report saved: ${reportPath}`, 'green');
  
  // Verification
  const verified = verifyNoOldVariables();
  
  if (verified) {
    log('\n✨ ENV compression completed successfully!', 'green');
    log(`\n📋 Next steps:`, 'blue');
    log(`   1. Review changes: git diff`, 'gray');
    log(`   2. Test locally: make dev`, 'gray');
    log(`   3. Update .env file with new variable names`, 'gray');
    log(`   4. Deploy: make deploy-env && make deploy-lambda-fast`, 'gray');
  } else {
    log('\n⚠️  Compression completed with warnings. Please review verification errors.', 'yellow');
  }
}

// Run
main().catch(error => {
  log(`\n❌ Error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
