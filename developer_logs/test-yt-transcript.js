#!/usr/bin/env node

/**
 * Quick test script for YouTube transcript fetching
 */

const https = require('https');

async function testYouTubeTranscript(videoId) {
  console.log(`\n🎬 Testing transcript fetch for video: ${videoId}`);
  console.log(`URL: https://www.youtube.com/watch?v=${videoId}\n`);
  
  // First, try to get caption tracks
  const apiKey = 'AIzaSyDFLprO5B-qKsoHprb8BooVmVTT0B5Mnus';
  const captionsUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${apiKey}`;
  
  console.log('Step 1: Fetching caption tracks...');
  const captionsData = await new Promise((resolve, reject) => {
    https.get(captionsUrl, {
      headers: {
        'Accept': 'application/json',
        'Referer': 'https://lambdallmproxy.pages.dev/'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          console.error(`❌ Caption API failed: ${res.statusCode}`);
          console.error(data);
          resolve(null);
        }
      });
    }).on('error', reject);
  });
  
  if (!captionsData || !captionsData.items || captionsData.items.length === 0) {
    console.log('❌ No captions available for this video');
    return;
  }
  
  console.log(`✅ Found ${captionsData.items.length} caption tracks:`);
  captionsData.items.forEach((item, i) => {
    console.log(`  ${i + 1}. Language: ${item.snippet.language}, Track type: ${item.snippet.trackKind}`);
  });
  
  // Find English caption (prefer standard over asr)
  const enCaptionStandard = captionsData.items.find(c => 
    (c.snippet.language === 'en' || c.snippet.language.startsWith('en')) &&
    c.snippet.trackKind === 'standard'
  );
  const enCaption = enCaptionStandard || captionsData.items.find(c => 
    c.snippet.language === 'en' || c.snippet.language.startsWith('en')
  ) || captionsData.items[0];
  
  console.log(`\nStep 2: Selected caption track:`);
  console.log(`  Language: ${enCaption.snippet.language}`);
  console.log(`  Track type: ${enCaption.snippet.trackKind}`);
  console.log(`  Track ID: ${enCaption.id}`);
  
  console.log(`\nStep 3: Fetching transcript`);
  
  // Try different timedtext formats with various parameters
  const timedTextUrls = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${enCaption.snippet.language}&name=${encodeURIComponent(enCaption.snippet.name || '')}`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${enCaption.snippet.language}`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${enCaption.snippet.language}&fmt=srv3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${enCaption.snippet.language}&fmt=srv1`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${enCaption.snippet.language}&tlang=en`
  ];
  
  for (const url of timedTextUrls) {
    console.log(`\nTrying: ${url}`);
    
    const transcriptXml = await new Promise((resolve) => {
      https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/xml, application/xml, */*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200 && data.length > 0) {
            resolve(data);
          } else {
            console.log(`  ❌ Failed: status ${res.statusCode}, length ${data.length}`);
            resolve(null);
          }
        });
      }).on('error', (err) => {
        console.log(`  ❌ Error: ${err.message}`);
        resolve(null);
      });
    });
    
    if (transcriptXml) {
      console.log(`  ✅ Success! Received ${transcriptXml.length} bytes`);
      console.log(`  First 500 chars: ${transcriptXml.substring(0, 500)}...`);
      
      // Parse and extract text
      const textMatches = transcriptXml.match(/<text[^>]*>([^<]*)<\/text>/g) || [];
      console.log(`  Found ${textMatches.length} text segments`);
      
      if (textMatches.length > 0) {
        const textLines = textMatches.slice(0, 5).map(match => {
          const text = match.replace(/<text[^>]*>/, '').replace(/<\/text>/, '');
          return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .trim();
        });
        console.log(`  First few lines of transcript:`);
        textLines.forEach((line, i) => {
          console.log(`    ${i + 1}. ${line}`);
        });
      }
      
      return; // Success, exit
    }
  }
  
  console.log('\n❌ All transcript fetch attempts failed');
}

// Test with a popular video that likely has captions
const testVideoId = process.argv[2] || 'dQw4w9WgXcQ'; // Default: Rick Astley - Never Gonna Give You Up (has captions)
testYouTubeTranscript(testVideoId).catch(console.error);
