/**
 * Inte        test('UI template should include copy and share buttons in Final Response header', () => {
            const templatePath = path.join(__dirname, '../../ui/index_template.html');ation tests for copy and share buttons functionality
 */

const { callFunction } = require('../../src/tools');
const fs = require('fs');
const path = require('path');

describe('Copy and Share Buttons Integration', () => {
    
    describe('UI Template Structure', () => {
        test('UI template should include copy and share buttons in Final Response header', () => {
            const templatePath = path.join(__dirname, '../../ui/index_template.html'); 
            const templateContent = fs.readFileSync(templatePath, 'utf8');
            
            // Check for copy button
            expect(templateContent).toContain('id="copy-response-btn"');
            expect(templateContent).toContain('class="action-btn copy-btn"');
            expect(templateContent).toContain('📋 Copy');
            
            // Check for share button  
            expect(templateContent).toContain('id="share-response-btn"');
            expect(templateContent).toContain('class="action-btn share-btn"');
            expect(templateContent).toContain('📧 Share');
            
            // Check for response header actions container
            expect(templateContent).toContain('class="response-header-actions"');
            
            // Verify buttons are in Final Response section
            const finalResponseSection = templateContent.match(/Final Response[\s\S]*?<\/div>/);
            expect(finalResponseSection).toBeTruthy();
            expect(finalResponseSection[0]).toContain('copy-response-btn');
            expect(finalResponseSection[0]).toContain('share-response-btn');
        });
        
        test('Built docs should have JavaScript handlers for copy and share functionality', () => {
            const docsJsPath = path.join(__dirname, '../../docs/js/main.js');
            const jsContent = fs.readFileSync(docsJsPath, 'utf8');
            
            // Check for copy function
            expect(jsContent).toContain('copyResponseToClipboard');
            expect(jsContent).toContain('navigator.clipboard.writeText');
            
            // Check for share function
            expect(jsContent).toContain('shareResponseByEmail');
            expect(jsContent).toContain('mailto:');
            
            // Check for event handlers setup
            expect(jsContent).toContain('setupResponseActionHandlers');
            expect(jsContent).toContain('copy-response-btn');
            expect(jsContent).toContain('share-response-btn');
            
            // Check for enable/disable functions
            expect(jsContent).toContain('enableResponseActions');
            expect(jsContent).toContain('disableResponseActions');
        });
    });
    
    describe('JavaScript Response Building', () => {
        test('JavaScript should build response containers with copy and share buttons', () => {
            const docsJsPath = path.join(__dirname, '../../docs/js/main.js');
            const jsContent = fs.readFileSync(docsJsPath, 'utf8');
            
            // Look for response-header-actions in the JavaScript that builds the UI
            expect(jsContent).toContain('response-header-actions');
            
            // Verify the buttons are created with proper structure
            const responseActionMatches = jsContent.match(/response-header-actions[\s\S]*?<\/div>/g);
            expect(responseActionMatches).toBeTruthy();
            expect(responseActionMatches.length).toBeGreaterThan(0);
            
            // Check that at least one instance has both buttons
            const hasCompleteButtons = responseActionMatches.some(match => 
                match.includes('copy-response-btn') && match.includes('share-response-btn')
            );
            expect(hasCompleteButtons).toBe(true);
        });
    });
    
    describe('CSS Styling', () => {
        test('CSS should include styles for copy and share buttons', () => {
            const cssPath = path.join(__dirname, '../../ui/styles.css');
            const cssContent = fs.readFileSync(cssPath, 'utf8');
            
            // Check for response header actions styles
            expect(cssContent).toContain('.response-header-actions');
            
            // Check for action button styles
            expect(cssContent).toContain('.action-btn');
            expect(cssContent).toContain('.copy-btn');
            expect(cssContent).toContain('.share-btn');
            
            // Check for hover effects
            expect(cssContent).toContain('.action-btn:hover');
            expect(cssContent).toContain('.copy-btn:hover');
            expect(cssContent).toContain('.share-btn:hover');
        });
    });
    
    describe('Built Documentation', () => {
        test('Built docs HTML should be accessible and parseable', () => {
            const docsPath = path.join(__dirname, '../../docs/index.html');
            expect(fs.existsSync(docsPath)).toBe(true);
            
            const docsContent = fs.readFileSync(docsPath, 'utf8');
            
            // Should be valid HTML
            expect(docsContent).toContain('<!DOCTYPE html>');
            expect(docsContent).toContain('<html');
            expect(docsContent).toContain('</html>');
            
            // Should load main.js if using modular approach, or have embedded JS
            const hasModularJS = docsContent.includes('js/main.js');
            const hasEmbeddedJS = docsContent.includes('copyResponseToClipboard');
            
            expect(hasModularJS || hasEmbeddedJS).toBe(true);
            
            // If using modular approach, should have response container where JS will build the Final Response
            if (hasModularJS) {
                expect(docsContent).toContain('response-container');
            } else {
                // If embedded JS, should have Final Response section
                expect(docsContent).toContain('Final Response');
            }
        });
    });
    
    describe('Function Integration', () => {
        test('Copy and share functions should be available and properly structured', () => {
            const docsJsPath = path.join(__dirname, '../../docs/js/main.js');
            const jsContent = fs.readFileSync(docsJsPath, 'utf8');
            
            // Test copyResponseToClipboard function structure
            const copyFunctionMatch = jsContent.match(/async function copyResponseToClipboard\(\)[\s\S]*?^}/m);
            expect(copyFunctionMatch).toBeTruthy();
            expect(copyFunctionMatch[0]).toContain('final-answer');
            expect(copyFunctionMatch[0]).toContain('clipboard.writeText');
            
            // Test shareResponseByEmail function structure
            const shareFunctionMatch = jsContent.match(/function shareResponseByEmail\(\)[\s\S]*?^}/m);
            expect(shareFunctionMatch).toBeTruthy();
            expect(shareFunctionMatch[0]).toContain('final-answer');
            expect(shareFunctionMatch[0]).toContain('mailto:');
            
            // Test event handler setup
            const handlerMatch = jsContent.match(/function setupResponseActionHandlers\(\)[\s\S]*?^}/m);
            expect(handlerMatch).toBeTruthy();
            expect(handlerMatch[0]).toContain('copy-response-btn');
            expect(handlerMatch[0]).toContain('share-response-btn');
        });
    });
});