#!/usr/bin/env node

/**
 * Node.js deployment script for AWS Lambda function
 * Deploys lambda_search_llm_handler.js to the existing llmproxy Lambda function
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
    functionName: 'llmproxy',
    region: 'us-east-1',
    sourceFile: 'lambda_search_llm_handler.js',
    tempDir: `/tmp/lambda-deploy-${Date.now()}`,
    zipFile: 'lambda-function.zip'
};

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, options = {}) {
    try {
        return execSync(command, { encoding: 'utf8', ...options });
    } catch (error) {
        throw new Error(`Command failed: ${command}\n${error.message}`);
    }
}

async function checkPrerequisites() {
    log('🔍 Checking prerequisites...', 'yellow');
    
    // Check if source file exists
    const sourceFilePath = path.join(__dirname, CONFIG.sourceFile);
    if (!fs.existsSync(sourceFilePath)) {
        throw new Error(`Source file ${CONFIG.sourceFile} not found!`);
    }
    
    // Check AWS CLI
    try {
        execCommand('aws --version');
        log('✅ AWS CLI is available', 'green');
    } catch (error) {
        throw new Error('AWS CLI is not installed or not in PATH');
    }
    
    // Check AWS credentials
    try {
        const identity = execCommand('aws sts get-caller-identity');
        const account = JSON.parse(identity).Account;
        log(`✅ AWS credentials configured for account: ${account}`, 'green');
    } catch (error) {
        throw new Error('AWS credentials not configured or invalid');
    }
    
    // Check if function exists
    try {
        execCommand(`aws lambda get-function --function-name ${CONFIG.functionName} --region ${CONFIG.region}`);
        log(`✅ Lambda function ${CONFIG.functionName} exists`, 'green');
    } catch (error) {
        throw new Error(`Lambda function ${CONFIG.functionName} not found in region ${CONFIG.region}`);
    }
}

async function createDeploymentPackage() {
    log('📦 Creating deployment package...', 'yellow');
    
    // Create temporary directory
    fs.mkdirSync(CONFIG.tempDir, { recursive: true });
    
    // Copy source file as index.mjs
    const sourceFile = path.join(__dirname, CONFIG.sourceFile);
    const targetFile = path.join(CONFIG.tempDir, 'index.mjs');
    fs.copyFileSync(sourceFile, targetFile);
    
    // Create package.json
    const packageJson = {
        name: 'llmproxy-lambda',
        version: '1.0.0',
        description: 'AWS Lambda handler for intelligent search + LLM response',
        main: 'index.mjs',
        type: 'module',
        dependencies: {},
        engines: {
            'node': '>=18.0.0'
        }
    };
    
    fs.writeFileSync(
        path.join(CONFIG.tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
    );
    
    // Create ZIP file
    const originalDir = process.cwd();
    process.chdir(CONFIG.tempDir);
    
    try {
        execCommand(`zip -r ${CONFIG.zipFile} index.mjs package.json`);
        log('✅ Package created', 'green');
    } finally {
        process.chdir(originalDir);
    }
    
    return path.join(CONFIG.tempDir, CONFIG.zipFile);
}

async function deployToLambda(zipFilePath) {
    log('🚀 Deploying to Lambda...', 'yellow');
    
    try {
        const updateResult = execCommand(`aws lambda update-function-code \
            --function-name ${CONFIG.functionName} \
            --region ${CONFIG.region} \
            --zip-file fileb://${zipFilePath} \
            --output json`);
        
        const result = JSON.parse(updateResult);
        
        log('✅ Function deployed successfully', 'green');
        
        return result;
    } catch (error) {
        throw new Error(`Failed to update Lambda function: ${error.message}`);
    }
}

async function setEnvironmentVariables() {
    
    try {
        const configResult = execCommand(`aws lambda get-function-configuration \
            --function-name ${CONFIG.functionName} \
            --region ${CONFIG.region} \
            --query 'Environment.Variables' \
            --output json`);
        
        const currentEnv = JSON.parse(configResult);
        
        if (!currentEnv.OPENAI_API_URL) {
            const newEnv = {
                ...currentEnv,
                OPENAI_API_URL: 'api.openai.com'
            };
            
            execCommand(`aws lambda update-function-configuration \
                --function-name ${CONFIG.functionName} \
                --region ${CONFIG.region} \
                --environment 'Variables=${JSON.stringify(newEnv)}'`);
            
            log('✅ Environment configured', 'green');
        }
    } catch (error) {
        log(`⚠️  Could not set environment variables: ${error.message}`, 'yellow');
    }
}

async function configureCORS() {
    
    try {
        const corsConfigResult = execCommand(`aws lambda get-function-url-config \
            --function-name ${CONFIG.functionName} \
            --region ${CONFIG.region} \
            --output json`);
        
        const corsConfig = JSON.parse(corsConfigResult);
        const cors = corsConfig.Cors || {};
        const invokeMode = corsConfig.InvokeMode;
        
        // Check current settings
        const currentOrigins = cors.AllowOrigins || [];
        const currentMethods = cors.AllowMethods || [];
        const currentHeaders = cors.AllowHeaders || [];
        
        let needsUpdate = false;
        
        // Check required settings
        if (!currentOrigins.includes('*') || 
            !currentMethods.includes('*') ||
            invokeMode !== 'BUFFERED') {
            needsUpdate = true;
        }
        
        // Check required headers
        const requiredHeaders = ['content-type', 'authorization', 'origin'];
        const missingHeaders = requiredHeaders.filter(header => 
            !currentHeaders.some(h => h.toLowerCase() === header.toLowerCase())
        );
        
        if (missingHeaders.length > 0) {
            needsUpdate = true;
        }
        
        if (needsUpdate) {
            execCommand(`aws lambda update-function-url-config \
                --function-name ${CONFIG.functionName} \
                --region ${CONFIG.region} \
                --cors AllowCredentials=true,AllowHeaders=content-type,authorization,origin,AllowMethods=*,AllowOrigins=*,MaxAge=86400 \
                --invoke-mode BUFFERED`);
            
            log('✅ CORS configuration updated', 'green');
        } else {
            log('✅ CORS configuration verified', 'green');
        }
        
    } catch (error) {
        log(`⚠️  Could not configure CORS: ${error.message}`, 'yellow');
        log('💡 You may need to create a Function URL first', 'yellow');
    }
}

async function testFunction() {
    log('🧪 Testing function...', 'yellow');
    
    try {
        const testResult = execCommand(`curl -s -X POST https://nrw7pperjjdswbmqgmigbwsbyi0rwdqf.lambda-url.us-east-1.on.aws/ \
            -H "Content-Type: application/json" \
            -d '{"query":"test deployment","api_key":"test","access_secret":"test"}' \
            --max-time 10`);
        
        if (testResult.includes('Invalid API key') || testResult.includes('answer')) {
            log('✅ Function operational', 'green');
        } else {
            log('⚠️  Function endpoint may need a moment to initialize', 'yellow');
        }
        
    } catch (error) {
        log(`⚠️  Function test failed: ${error.message}`, 'yellow');
    }
}

function cleanup() {
    try {
        fs.rmSync(CONFIG.tempDir, { recursive: true, force: true });
    } catch (error) {
        // Silent cleanup
    }
}

async function main() {
    try {
        log('🚀 Starting deployment...', 'blue');
        
        await checkPrerequisites();
        const zipFile = await createDeploymentPackage();
        await deployToLambda(zipFile);
        await setEnvironmentVariables();
        await configureCORS();
        await testFunction();
        
        log('🎉 Deployment completed successfully!', 'green');
        
    } catch (error) {
        log(`❌ Deployment failed: ${error.message}`, 'red');
        process.exit(1);
    } finally {
        cleanup();
    }
}

// Run the deployment
main().catch(console.error);