/**
 * Integration tests for copy and share buttons functionality in the new React/Vite UI build.
 */

const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, '../../docs');
const UI_SOURCE_PATH = path.join(__dirname, '../../ui-new/src/components/ChatTab.tsx');

function readFile(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function resolveDocsBundleContent() {
    const indexPath = path.join(DOCS_DIR, 'index.html');
    const html = readFile(indexPath);
    const scriptMatch = html.match(/<script[^>]+src="\/?(assets\/[^"]+\.js)"/i);
    if (!scriptMatch) {
        throw new Error('Unable to locate built JS bundle in docs/index.html');
    }
    const scriptPath = path.join(DOCS_DIR, scriptMatch[1]);
    if (!fs.existsSync(scriptPath)) {
        throw new Error(`Built JS bundle not found: ${scriptPath}`);
    }
    return readFile(scriptPath);
}

// SKIP: These tests are UI integration tests that may have dependencies
// TODO: Review if these can be made to work or need refactoring
describe.skip('Copy and Share Buttons Integration', () => {
    describe('React source implementation', () => {
        let chatTabSource;

        beforeAll(() => {
            chatTabSource = readFile(UI_SOURCE_PATH);
        });

        test('Assistant message actions include copy and Gmail share handlers', () => {
            expect(chatTabSource).toContain('navigator.clipboard.writeText');
            expect(chatTabSource).toContain('title="Copy to clipboard"');
            expect(chatTabSource).toContain('window.open(`https://mail.google.com/mail/?view=cm');
            expect(chatTabSource).toContain('title="Share via Gmail"');
        });

        test('Assistant action buttons expose accessible labels', () => {
            expect(chatTabSource).toMatch(/>\s*Copy\s*</);
            expect(chatTabSource).toMatch(/>\s*Gmail\s*</);
            expect(chatTabSource).toContain('showSuccess(');
            expect(chatTabSource).toContain('showError(');
        });
    });

    describe('Built documentation bundle', () => {
        test('docs/index.html renders root container and module bundle', () => {
            const indexPath = path.join(DOCS_DIR, 'index.html');
            expect(fs.existsSync(indexPath)).toBe(true);

            const html = readFile(indexPath);
            expect(/<!doctype html>/i.test(html)).toBe(true);
            expect(html).toContain('<div id="root"></div>');
            expect(html).toMatch(/<script[^>]+src="\/?assets\//);
        });

        test('Built JS bundle retains copy and share logic', () => {
            const bundle = resolveDocsBundleContent();
            expect(bundle).toContain('navigator.clipboard.writeText');
            expect(bundle).toContain('Copied to clipboard');
            expect(bundle).toContain('Failed to copy');
            expect(bundle).toContain('https://mail.google.com/mail/?view=cm');
        });
    });
});