/**
 * Tests for HTML Content Extraction
 */

const { extractContent, htmlToMarkdown, htmlToText, extractMainContent } = require('../../src/html-content-extractor');

describe('HTML Content Extractor', () => {
    describe('htmlToMarkdown', () => {
        it('should convert headings to Markdown', () => {
            const html = '<h1>Title</h1><h2>Subtitle</h2><p>Content</p>';
            const result = htmlToMarkdown(html);
            expect(result).toContain('# Title');
            expect(result).toContain('## Subtitle');
            expect(result).toContain('Content');
        });

        it('should convert lists to Markdown', () => {
            const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
            const result = htmlToMarkdown(html);
            expect(result).toContain('- Item 1');
            expect(result).toContain('- Item 2');
        });

        it('should convert links to Markdown', () => {
            const html = '<a href="https://example.com">Example Link</a>';
            const result = htmlToMarkdown(html);
            expect(result).toContain('[Example Link](https://example.com)');
        });

        it('should convert code blocks', () => {
            const html = '<pre><code>const x = 5;</code></pre>';
            const result = htmlToMarkdown(html);
            expect(result).toContain('```');
            expect(result).toContain('const x = 5;');
        });

        it('should convert inline code', () => {
            const html = '<p>Use <code>console.log()</code> for debugging</p>';
            const result = htmlToMarkdown(html);
            expect(result).toContain('`console.log()`');
        });

        it('should convert emphasis', () => {
            const html = '<p>This is <strong>bold</strong> and <em>italic</em></p>';
            const result = htmlToMarkdown(html);
            expect(result).toContain('**bold**');
            expect(result).toContain('*italic*');
        });

        it('should remove script tags', () => {
            const html = '<p>Content</p><script>alert("xss")</script>';
            const result = htmlToMarkdown(html);
            expect(result).toContain('Content');
            expect(result).not.toContain('alert');
            expect(result).not.toContain('script');
        });

        it('should remove style tags', () => {
            const html = '<p>Content</p><style>.class { color: red; }</style>';
            const result = htmlToMarkdown(html);
            expect(result).toContain('Content');
            expect(result).not.toContain('color');
            expect(result).not.toContain('style');
        });

        it('should remove navigation elements', () => {
            const html = '<nav>Menu</nav><main><p>Content</p></main>';
            const result = htmlToMarkdown(html);
            expect(result).toContain('Content');
            expect(result).not.toContain('Menu');
        });

        it('should decode HTML entities', () => {
            const html = '<p>&lt;div&gt; &amp; &quot;quotes&quot;</p>';
            const result = htmlToMarkdown(html);
            expect(result).toContain('<div>');
            expect(result).toContain('&');
            expect(result).toContain('"quotes"');
        });

        it('should resolve relative URLs to absolute URLs', () => {
            const html = `
                <a href="/path/to/page">Relative Link</a>
                <a href="./relative.html">Dot Relative</a>
                <a href="../parent.html">Parent Relative</a>
                <a href="https://example.com/absolute">Absolute Link</a>
            `;
            const baseUrl = 'https://example.com/current/page.html';
            const result = htmlToMarkdown(html, baseUrl);
            
            expect(result).toContain('[Relative Link](https://example.com/path/to/page)');
            expect(result).toContain('[Dot Relative](https://example.com/current/relative.html)');
            expect(result).toContain('[Parent Relative](https://example.com/parent.html)');
            expect(result).toContain('[Absolute Link](https://example.com/absolute)');
        });

        it('should handle protocol-relative URLs', () => {
            const html = '<a href="//cdn.example.com/resource">CDN Link</a>';
            const baseUrl = 'https://example.com/page';
            const result = htmlToMarkdown(html, baseUrl);
            expect(result).toContain('[CDN Link](https://cdn.example.com/resource)');
        });

        it('should preserve anchor and special links', () => {
            const html = `
                <a href="#section">Anchor</a>
                <a href="javascript:void(0)">JS Link</a>
                <a href="mailto:test@example.com">Email</a>
            `;
            const baseUrl = 'https://example.com/page';
            const result = htmlToMarkdown(html, baseUrl);
            
            expect(result).toContain('[Anchor](#section)');
            expect(result).toContain('[JS Link](javascript:void(0))');
            expect(result).toContain('[Email](mailto:test@example.com)');
        });
    });

    describe('htmlToText', () => {
        it('should extract plain text from HTML', () => {
            const html = '<div><h1>Title</h1><p>Paragraph text</p></div>';
            const result = htmlToText(html);
            expect(result).toContain('Title');
            expect(result).toContain('Paragraph text');
            expect(result).not.toContain('<');
            expect(result).not.toContain('>');
        });

        it('should remove scripts and styles', () => {
            const html = '<script>evil()</script><p>Good content</p><style>body{}</style>';
            const result = htmlToText(html);
            expect(result).toContain('Good content');
            expect(result).not.toContain('evil');
            expect(result).not.toContain('body{}');
        });

        it('should preserve newlines between elements', () => {
            const html = '<p>First</p><p>Second</p>';
            const result = htmlToText(html);
            expect(result).toMatch(/First[\s\n]+Second/);
        });
    });

    describe('extractMainContent', () => {
        it('should extract content from main tag', () => {
            const html = '<nav>Menu</nav><main><p>Main content here with enough text to pass the threshold for extraction testing purposes</p></main><footer>Footer</footer>';
            const result = extractMainContent(html);
            expect(result).toContain('Main content');
            expect(result).not.toContain('Menu');
            expect(result).not.toContain('Footer');
        });

        it('should extract content from article tag', () => {
            const html = '<nav>Menu</nav><article><p>Article content</p></article>';
            const result = extractMainContent(html);
            expect(result).toContain('Article content');
        });

        it('should extract content from common content classes', () => {
            const html = '<nav>Menu</nav><div class="main-content"><p>Content</p></div>';
            const result = extractMainContent(html);
            expect(result).toContain('Content');
        });

        it('should return full HTML if no main content found', () => {
            const html = '<div><p>Some content</p></div>';
            const result = extractMainContent(html);
            expect(result).toBe(html);
        });
    });

    describe('extractContent', () => {
        it('should return markdown format for well-structured HTML', () => {
            const html = '<article><h1>Title</h1><p>Content paragraph</p></article>';
            const result = extractContent(html);
            expect(result.format).toBe('markdown');
            expect(result.content).toContain('# Title');
            expect(result.content).toContain('Content paragraph');
            expect(result.originalLength).toBeGreaterThan(0);
            expect(result.extractedLength).toBeGreaterThan(0);
        });

        it('should include compression ratio', () => {
            const html = '<article><h1>Title</h1><p>Content</p></article>';
            const result = extractContent(html);
            expect(result.compressionRatio).toBeDefined();
            expect(parseFloat(result.compressionRatio)).toBeLessThan(1);
        });

        it('should handle empty HTML gracefully', () => {
            const result = extractContent('');
            expect(result.format).toBe('none');
            expect(result.error).toBeDefined();
        });

        it('should fallback to text when markdown extraction is poor', () => {
            const html = '<div>Short</div>'; // Too short for markdown
            const result = extractContent(html);
            expect(['text', 'markdown']).toContain(result.format);
        });

        it('should handle malformed HTML', () => {
            const html = '<div><p>Unclosed paragraph<div>More content</div>';
            const result = extractContent(html);
            expect(result.content).toBeTruthy();
            expect(result.format).toBeDefined();
        });

        it('should extract content from complex real-world HTML', () => {
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Example Page</title>
                    <script>var x = 5;</script>
                    <style>body { margin: 0; }</style>
                </head>
                <body>
                    <header>
                        <nav>Navigation Links</nav>
                    </header>
                    <main>
                        <article>
                            <h1>Article Title</h1>
                            <p>This is the main content that should be extracted.</p>
                            <ul>
                                <li>List item 1</li>
                                <li>List item 2</li>
                            </ul>
                            <p>More <strong>important</strong> content.</p>
                        </article>
                    </main>
                    <footer>Copyright 2025</footer>
                </body>
                </html>
            `;
            
            const result = extractContent(html);
            expect(result.content).toContain('Article Title');
            expect(result.content).toContain('main content');
            expect(result.content).toContain('List item 1');
            expect(result.content).not.toContain('Navigation Links');
            expect(result.content).not.toContain('Copyright');
            expect(result.content).not.toContain('var x = 5');
            expect(result.extractedLength).toBeLessThan(result.originalLength);
        });

        it('should preserve links in markdown format', () => {
            const html = '<article><p>Check <a href="https://example.com">this link</a></p></article>';
            const result = extractContent(html);
            expect(result.content).toContain('[this link](https://example.com)');
        });
    });

    describe('Token efficiency', () => {
        it('should significantly reduce token count', () => {
            // Simulate a typical bloated web page
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Page</title>
                    <script src="analytics.js"></script>
                    <script>
                        // Lots of tracking code
                        var tracker = {};
                        tracker.init = function() { /* ... */ };
                    </script>
                    <style>
                        .nav { display: flex; }
                        .sidebar { width: 200px; }
                        /* Many more styles... */
                    </style>
                </head>
                <body>
                    <header><nav>Home | About | Contact</nav></header>
                    <aside class="sidebar">Ads and related content</aside>
                    <main>
                        <article>
                            <h1>Important Article</h1>
                            <p>This is the actual content users care about.</p>
                        </article>
                    </main>
                    <footer>© 2025 Company Name. All rights reserved.</footer>
                </body>
                </html>
            `;
            
            const result = extractContent(html);
            
            // Should extract less than 30% of original
            expect(result.extractedLength).toBeLessThan(result.originalLength * 0.3);
            
            // Should contain the important content
            expect(result.content).toContain('Important Article');
            expect(result.content).toContain('actual content');
            
            // Should not contain the bloat
            expect(result.content).not.toContain('tracker');
            expect(result.content).not.toContain('analytics');
            expect(result.content).not.toContain('.nav');
        });
    });
});
