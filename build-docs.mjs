#!/usr/bin/env node

/**
 * Build script for LLM Proxy documentation
 * Copies index_template.html to docs/ folder and replaces environment variables
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for console output
const colors = {
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    reset: '\x1b[0m'
};

function log(type, message) {
    const icons = { info: '✅', warn: '⚠️ ', error: '❌' };
    const color = colors[type === 'error' ? 'red' : type === 'warn' ? 'yellow' : 'green'];
    console.log(`${color}${icons[type]} ${message}${colors.reset}`);
}

function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');
    
    if (!fs.existsSync(envPath)) {
        log('error', '.env file not found!');
        log('warn', 'Please copy .env.example to .env and fill in your values:');
        log('warn', 'cp .env.example .env');
        process.exit(1);
    }

    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                envVars[key.trim()] = valueParts.join('=').trim();
            }
        }
    });

    return envVars;
}

function validateEnvVars(envVars) {
    const required = ['LAMBDA_URL', 'ACCESS_SECRET', 'GOOGLE_CLIENT_ID'];
    const missing = required.filter(key => !envVars[key]);
    
    if (missing.length > 0) {
        log('error', 'Missing required environment variables:');
        missing.forEach(key => log('error', `  - ${key}`));
        log('warn', 'Please update your .env file with the missing variables');
        process.exit(1);
    }
}

function buildDocs(envVars) {
    const testHtmlPath = path.join(__dirname, 'index_template.html');
    const docsDir = path.join(__dirname, 'docs');
    const outputPath = path.join(docsDir, 'index.html');

    // Create docs directory
    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
    }

    // Read template file
    let content = fs.readFileSync(testHtmlPath, 'utf8');

    // Replace placeholders with environment variables (excluding OPENAI_API_KEY)
    content = content
        .replace(/\{\{LAMBDA_URL\}\}/g, envVars.LAMBDA_URL)
        .replace(/\{\{ACCESS_SECRET\}\}/g, envVars.ACCESS_SECRET)
        .replace(/\{\{GOOGLE_CLIENT_ID\}\}/g, envVars.GOOGLE_CLIENT_ID);

    // Write output file
    fs.writeFileSync(outputPath, content, 'utf8');

    log('info', 'Documentation built successfully!');
    log('info', '📁 Output: docs/index.html');
    log('warn', '⚠️  The docs/index.html file contains your Lambda URL, access secret, and Google Client ID');
    log('warn', '⚠️  OpenAI API key is kept as placeholder for manual entry');
}

function main() {
    try {
        log('info', 'Loading environment variables from .env...');
        const envVars = loadEnvFile();
        
        log('info', 'Validating environment variables...');
        validateEnvVars(envVars);
        
        log('info', 'Building documentation with environment variables...');
        buildDocs(envVars);
        
        log('info', 'Build completed successfully!');
        log('info', 'You can now serve the docs folder locally or deploy it securely');
        
    } catch (error) {
        log('error', `Build failed: ${error.message}`);
        process.exit(1);
    }
}

main();