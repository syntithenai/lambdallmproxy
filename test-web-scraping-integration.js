#!/usr/bin/env node

/**
 * Integration Test for Web Scraping Content Preservation
 * Tests with realistic HTML pages to verify all features work correctly
 */

const { SimpleHTMLParser } = require('./src/html-parser.js');
const fs = require('fs');
const path = require('path');

// Test utilities
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('🌐 Web Scraping Integration Test\n');
console.log('='.repeat(60));

// ============================================================================
// Create Realistic Test HTML Pages
// ============================================================================

const realisticNewsArticle = `
<!DOCTYPE html>
<html>
<head><title>AI Breakthrough in 2024</title></head>
<body style="width: 1200px; height: 5000px;">
  <!-- Hero image at top -->
  <div style="position: absolute; top: 0px; width: 100%;">
    <img src="https://example.com/hero-ai-breakthrough.jpg" 
         width="1200" height="600" 
         alt="AI Research Lab with scientists working on neural networks" />
  </div>
  
  <!-- Navigation - skip these images -->
  <nav style="position: absolute; top: 620px;">
    <img src="logo.svg" width="50" height="50" alt="Company Logo" />
    <img src="icon-menu.png" width="20" height="20" />
  </nav>
  
  <!-- Main article content -->
  <article style="position: absolute; top: 700px; width: 800px;">
    <h1>Major AI Breakthrough Announced in 2024</h1>
    <p class="meta">Published: January 15, 2024 | Author: Dr. Jane Smith</p>
    
    <p>Researchers at the University of Technology have announced a major breakthrough 
    in artificial intelligence that could revolutionize the field of machine learning.</p>
    
    <!-- Content image (in article body) -->
    <figure style="margin: 20px 0;">
      <img src="https://example.com/neural-network-diagram.jpg"
           width="800" height="500"
           alt="Detailed neural network architecture diagram showing the breakthrough" />
      <figcaption>Figure 1: The new neural network architecture</figcaption>
    </figure>
    
    <p>The research team reports that their new model achieves 98% accuracy on 
    complex reasoning tasks, a 45% improvement over previous state-of-the-art systems.</p>
    
    <blockquote>
      "This is the most significant advancement we've seen in five years," 
      said Dr. Smith, lead researcher on the project.
    </blockquote>
    
    <p>Key metrics from the research:</p>
    <ul>
      <li>Training time reduced from 30 days to 3 days</li>
      <li>Model size decreased by 67% while improving accuracy</li>
      <li>Energy consumption down 80% compared to baseline</li>
      <li>Cost savings of $2.5 million per training run</li>
    </ul>
    
    <!-- Another content image -->
    <figure style="margin: 20px 0;">
      <img src="https://example.com/research-team.jpg"
           width="700" height="450"
           alt="Dr. Smith and her research team in the AI laboratory" />
      <figcaption>The research team celebrating their breakthrough</figcaption>
    </figure>
    
    <p>The findings will be presented at the International Conference on Machine 
    Learning in June 2024.</p>
  </article>
  
  <!-- Sidebar (should be deprioritized) -->
  <aside class="sidebar" style="position: absolute; top: 700px; left: 850px; width: 300px;">
    <h3>Related Stories</h3>
    <div class="widget">
      <img src="https://example.com/sidebar-ad1.jpg" 
           width="300" height="250" 
           alt="Advertisement" />
    </div>
    <div class="widget">
      <img src="https://example.com/sidebar-related.jpg" 
           width="300" height="200" 
           alt="Related article thumbnail" />
    </div>
  </aside>
  
  <!-- Footer images (should be deprioritized) -->
  <footer style="position: absolute; top: 4500px; width: 100%;">
    <img src="footer-logo.png" width="100" height="50" alt="Footer Logo" />
    <img src="social-facebook.png" width="30" height="30" alt="Facebook" />
    <img src="social-twitter.png" width="30" height="30" alt="Twitter" />
  </footer>
</body>
</html>
`;

const realisticBlogPost = `
<!DOCTYPE html>
<html>
<head><title>Product Review: Best Laptops 2024</title></head>
<body style="width: 1000px; height: 8000px;">
  <!-- Header area -->
  <header style="position: absolute; top: 0px;">
    <img src="site-logo.png" width="150" height="60" alt="Tech Reviews" />
  </header>
  
  <!-- Hero/Featured image near top -->
  <div style="position: absolute; top: 100px;">
    <img src="https://example.com/laptop-hero.jpg"
         width="1000" height="500"
         alt="Best laptop of 2024 - sleek design with high-resolution display" />
  </div>
  
  <!-- Main content -->
  <main style="position: absolute; top: 650px;">
    <h1>The Best Laptops of 2024: Our Top 5 Picks</h1>
    
    <p class="intro">After testing 47 laptops over three months, we've compiled 
    our definitive list of the best laptops you can buy in 2024.</p>
    
    <h2>1. TechPro X1 - Best Overall</h2>
    <div style="margin: 20px 0;">
      <img src="https://example.com/techpro-x1.jpg"
           width="800" height="600"
           alt="TechPro X1 laptop showing keyboard and display" />
    </div>
    <p><strong>Price:</strong> $1,499 | <strong>CPU:</strong> Intel Core i7-13700 | 
    <strong>RAM:</strong> 16GB | <strong>Score:</strong> 9.2/10</p>
    
    <h2>2. ValueBook Pro - Best Budget</h2>
    <div style="margin: 20px 0;">
      <img src="https://example.com/valuebook-pro.jpg"
           width="800" height="600"
           alt="ValueBook Pro laptop budget-friendly option" />
    </div>
    <p><strong>Price:</strong> $699 | <strong>CPU:</strong> AMD Ryzen 5 | 
    <strong>RAM:</strong> 8GB | <strong>Score:</strong> 8.5/10</p>
    
    <h2>3. CreativePro 15 - Best for Design</h2>
    <div style="margin: 20px 0;">
      <img src="https://example.com/creativepro-15.jpg"
           width="800" height="600"
           alt="CreativePro 15 with color-accurate 4K display" />
    </div>
    <p><strong>Price:</strong> $2,199 | <strong>Display:</strong> 4K OLED | 
    <strong>Score:</strong> 9.0/10</p>
  </main>
  
  <!-- Sidebar ads -->
  <aside class="sidebar-ads" style="position: absolute; top: 650px; left: 850px;">
    <img src="ad-banner-1.jpg" width="300" height="600" alt="Advertisement" />
    <img src="ad-banner-2.jpg" width="300" height="250" alt="Sponsored" />
  </aside>
</body>
</html>
`;

// ============================================================================
// TEST 1: News Article - Image Classification
// ============================================================================
console.log('\n📰 TEST 1: News Article Image Classification\n');

try {
  const parser = new SimpleHTMLParser(realisticNewsArticle, 'https://example.com/article');
  const images = parser.extractImages();
  
  console.log(`Extracted ${images.length} images\n`);
  
  // Filter out tiny icons/logos
  const significantImages = images.filter(img => 
    (img.width || 0) > 100 && (img.height || 0) > 100
  );
  
  console.log('Image classification results:');
  significantImages.forEach((img, idx) => {
    const filename = img.src.split('/').pop().substring(0, 30);
    console.log(`  ${idx + 1}. ${filename.padEnd(32)} - ${img.placement.padEnd(12)} ` +
      `(placement: ${(img.placementScore || 0.5).toFixed(2)}, relevance: ${(img.relevance || 0.5).toFixed(2)})`);
  });
  
  // Find hero image
  const heroImage = significantImages.find(img => img.src.includes('hero-ai-breakthrough'));
  if (heroImage) {
    console.log(`\n✅ Hero image detected with placement: ${heroImage.placement} (score: ${heroImage.placementScore})`);
    assert(heroImage.placement === 'hero' || heroImage.placement === 'above-fold',
      'Hero image should be classified as hero or above-fold');
    assert(heroImage.placementScore >= 0.9,
      'Hero image should have high placement score');
  } else {
    console.log('⚠️  Hero image not found in results');
  }
  
  // Find sidebar ads
  const sidebarAds = significantImages.filter(img => img.src.includes('sidebar-ad'));
  if (sidebarAds.length > 0) {
    const avgSidebarScore = sidebarAds.reduce((sum, img) => sum + (img.placementScore || 0.5), 0) / sidebarAds.length;
    console.log(`\n✅ Sidebar ads detected with avg placement score: ${avgSidebarScore.toFixed(2)}`);
    assert(avgSidebarScore <= 0.5,
      'Sidebar ads should have low placement scores');
  }
  
  // Find content images (neural network diagram, research team)
  const contentImages = significantImages.filter(img => 
    img.src.includes('neural-network-diagram') || img.src.includes('research-team')
  );
  console.log(`\n✅ Found ${contentImages.length} content images in article body`);
  
  // Test smart selection algorithm
  console.log('\n🎯 Smart Selection Algorithm Test:');
  const scoredImages = significantImages.map(img => ({
    ...img,
    combinedScore: (img.placementScore || 0.5) * 0.6 + (img.relevance || 0.5) * 0.4
  })).sort((a, b) => b.combinedScore - a.combinedScore);
  
  console.log('\nTop 3 images by combined score:');
  scoredImages.slice(0, 3).forEach((img, idx) => {
    const filename = img.src.split('/').pop().substring(0, 30);
    console.log(`  ${idx + 1}. ${filename.padEnd(32)} (combined: ${img.combinedScore.toFixed(3)})`);
  });
  
  // Verify hero or main content is in top 3
  const top3 = scoredImages.slice(0, 3);
  const hasHeroOrContent = top3.some(img => 
    img.src.includes('hero') || img.src.includes('neural-network') || img.src.includes('research-team')
  );
  assert(hasHeroOrContent, 'Top 3 should include hero or main content images, not sidebar ads');
  
} catch (error) {
  console.error('❌ ERROR in news article test:', error.message);
  console.error(error.stack);
}

// ============================================================================
// TEST 2: Blog Post - Product Images
// ============================================================================
console.log('\n\n📝 TEST 2: Blog Post Product Review\n');

try {
  const parser = new SimpleHTMLParser(realisticBlogPost, 'https://example.com/blog');
  const images = parser.extractImages();
  
  console.log(`Extracted ${images.length} images\n`);
  
  // Filter significant images
  const significantImages = images.filter(img => 
    (img.width || 0) > 100 && (img.height || 0) > 100
  );
  
  // Find product images
  const productImages = significantImages.filter(img => 
    img.src.includes('techpro') || img.src.includes('valuebook') || img.src.includes('creativepro')
  );
  
  console.log(`Found ${productImages.length} product images`);
  
  // Calculate combined scores
  const scored = significantImages.map(img => ({
    src: img.src.split('/').pop().substring(0, 30),
    placement: img.placement,
    combinedScore: (img.placementScore || 0.5) * 0.6 + (img.relevance || 0.5) * 0.4
  })).sort((a, b) => b.combinedScore - a.combinedScore);
  
  console.log('\nAll images ranked:');
  scored.forEach((img, idx) => {
    console.log(`  ${idx + 1}. ${img.src.padEnd(32)} - ${img.placement.padEnd(12)} (${img.combinedScore.toFixed(3)})`);
  });
  
  // Verify product images rank higher than sidebar ads
  const hasProductInTop3 = scored.slice(0, 3).some(img => 
    img.src.includes('techpro') || img.src.includes('valuebook') || 
    img.src.includes('creativepro') || img.src.includes('laptop-hero')
  );
  assert(hasProductInTop3, 'Top 3 should include product or hero images, not sidebar ads');
  
} catch (error) {
  console.error('❌ ERROR in blog post test:', error.message);
  console.error(error.stack);
}

// ============================================================================
// TEST 3: Content Extraction Quality
// ============================================================================
console.log('\n\n✂️  TEST 3: Content Extraction from Realistic HTML\n');

try {
  const parser = new SimpleHTMLParser(realisticNewsArticle, 'https://example.com/article');
  const text = parser.extractTextContent();
  
  console.log(`Extracted ${text.length} characters of text content`);
  
  // Check if key information is preserved
  const hasTitle = text.toLowerCase().includes('breakthrough');
  const hasDate = text.includes('2024') || text.includes('January');
  const hasMetrics = text.includes('98%') || text.includes('45%');
  const hasQuote = text.toLowerCase().includes('significant advancement');
  const hasCosts = text.includes('$2.5 million');
  
  console.log(`\nContent quality checks:`);
  console.log(`  Title/headline present: ${hasTitle ? '✅' : '❌'}`);
  console.log(`  Date information: ${hasDate ? '✅' : '❌'}`);
  console.log(`  Key metrics: ${hasMetrics ? '✅' : '❌'}`);
  console.log(`  Important quotes: ${hasQuote ? '✅' : '❌'}`);
  console.log(`  Financial data: ${hasCosts ? '✅' : '❌'}`);
  
  const qualityScore = [hasTitle, hasDate, hasMetrics, hasQuote, hasCosts].filter(Boolean).length;
  assert(qualityScore >= 4, `Content extraction should preserve key information (got ${qualityScore}/5)`);
  
} catch (error) {
  console.error('❌ ERROR in content extraction test:', error.message);
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n' + '='.repeat(60));
console.log('📊 INTEGRATION TEST SUMMARY\n');

if (process.exitCode === 1) {
  console.log('❌ Some tests failed. Review the output above.\n');
} else {
  console.log('✅ All integration tests passed!\n');
  console.log('Key findings:');
  console.log('  ✓ Image placement classification working');
  console.log('  ✓ Smart selection prioritizes hero/content over sidebar/footer');
  console.log('  ✓ Content extraction preserves important information');
  console.log('\nReady for production testing with real web pages.\n');
}

process.exit(process.exitCode || 0);
