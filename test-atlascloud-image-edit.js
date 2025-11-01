/**
 * Test script to verify Atlas Cloud image editing functionality
 * Tests the img2img API with the "add glasses" command
 */

const fs = require('fs');
const path = require('path');
const { generateImage } = require('../src/image-providers/atlascloud');

async function testAtlasCloudImageEditing() {
  console.log('🧪 Testing Atlas Cloud Image Editing (img2img)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Load sample image (cat image)
  const sampleImagePath = path.join(__dirname, '../ui-new/public/samples/test-cat.jpg');
  
  // Check if sample image exists
  if (!fs.existsSync(sampleImagePath)) {
    console.log('⚠️ Sample cat image not found. Using dummy base64 data for test.');
    // Create a minimal 1x1 red pixel PNG for testing
    const dummyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    
    await runTest(dummyBase64);
    return;
  }
  
  // Load and convert image to base64
  const imageBuffer = fs.readFileSync(sampleImagePath);
  const base64Data = imageBuffer.toString('base64');
  
  await runTest(base64Data);
}

async function runTest(base64ImageData) {
  const apiKey = process.env.LP_KEY_4 || 'apikey-6c6705cf55174eadaa924203b916ae84';
  
  console.log(`\n1️⃣ Test: Generate New Image (No Reference)`);
  console.log('─────────────────────────────────────────────');
  
  try {
    const result1 = await generateImage({
      prompt: 'A cute orange cat sitting on a windowsill',
      model: 'wavespeed-ai/flux-schnell',
      size: '512x512',
      apiKey
    });
    
    console.log('✅ Success:', {
      imageUrl: result1.imageUrl.substring(0, 80) + '...',
      model: result1.model,
      provider: result1.provider,
      cost: `$${result1.cost.toFixed(4)}`,
      duration: `${result1.metadata.duration}ms`
    });
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
  
  console.log(`\n2️⃣ Test: Edit Existing Image (With Reference) - "add glasses"`);
  console.log('─────────────────────────────────────────────');
  
  try {
    const result2 = await generateImage({
      prompt: 'Add stylish sunglasses to this cat. Keep everything else exactly the same.',
      model: 'wavespeed-ai/flux-kontext-dev',
      size: '512x512',
      referenceImages: [base64ImageData],
      apiKey
    });
    
    console.log('✅ Success:', {
      imageUrl: result2.imageUrl.substring(0, 80) + '...',
      model: result2.model,
      provider: result2.provider,
      cost: `$${result2.cost.toFixed(4)}`,
      duration: `${result2.metadata.duration}ms`,
      referenceImageUsed: result2.metadata.referenceImageUsed
    });
    
    console.log('\n✨ Image editing test completed successfully!');
    console.log('🔗 Open this URL in browser to see result:', result2.imageUrl);
    
  } catch (error) {
    console.error('❌ Failed:', error.message);
    if (error.providerUnavailable) {
      console.error('⚠️ Provider unavailable reason:', error.reason);
    }
  }
}

// Run test
if (require.main === module) {
  testAtlasCloudImageEditing()
    .then(() => {
      console.log('\n✅ Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testAtlasCloudImageEditing };
