const https = require('https');

// Test the Lambda function with a simple query
const testData = JSON.stringify({
    query: "What is 2+2?",
    apiKey: process.env.OPENAI_KEY || "test-key-to-trigger-processing"
});

const options = {
    hostname: 'vciqzbhwvxj3q7onmjksec7pie0khzws.lambda-url.us-east-1.on.aws',
    path: '/',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': testData.length,
        'Accept': 'text/event-stream'
    }
};

console.log('Testing Lambda function with simple query...');

const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);
    
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
        console.log('Received chunk:', chunk.toString());
    });
    
    res.on('end', () => {
        console.log('\nComplete response:');
        console.log(data);
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

// Send the request
req.write(testData);
req.end();