// A Node.js Lambda function to proxy LLM text generation requests
// to an OpenAI-style API.
// This version is updated to use ES module syntax (import/export) and
// correctly parse the request body from an HTML form.

// The main handler for the Lambda function.
// It receives the request event and context objects.
export const handler = async (event, context) => {
    try {
        // Log the received event for debugging purposes
        console.log('Received event:', JSON.stringify(event, null, 2));
       
        // Correctly check the HTTP method for a Lambda Function URL payload
        if (event.requestContext.http.method !== 'POST') {
            return {
                statusCode: 405,
                body: JSON.stringify({ error: 'Method Not Allowed' }),
            };
        }

        let body;
        const contentType = event.headers['content-type'] || event.headers['Content-Type'] || "application/json";

        // Check if the body is Base64 encoded and decode if necessary
        const decodedBody = event.isBase64Encoded
            ? Buffer.from(event.body, 'base64').toString('utf-8')
            : event.body;

        // Parse the body based on the Content-Type
        if (contentType && contentType.includes('application/x-www-form-urlencoded')) {
            // If the content type is form data, parse it with URLSearchParams
            const params = new URLSearchParams(decodedBody);
            body = {
                api_key: params.get('api_key'),
                model: params.get('model'),
                prompt: params.get('prompt'),
                max_tokens: params.get('max_tokens'),
                access_secret: params.get('access_secret'),
            };
        } else if (contentType && contentType.includes('application/json')) {
            // If the content type is JSON, parse it directly
            body = JSON.parse(decodedBody);
        } else {
            return {
                statusCode: 415,
                body: JSON.stringify({ error: 'Unsupported Media Type' }),
            };
        }

        // Check for ACCESS_SECRET environment variable and validate if set
        const requiredAccessSecret = process.env.ACCESS_SECRET;
        if (requiredAccessSecret) {
            const providedAccessSecret = body.access_secret;
            if (!providedAccessSecret || providedAccessSecret !== requiredAccessSecret) {
                return {
                    statusCode: 401,
                    body: JSON.stringify({ error: 'Unauthorized: Invalid or missing access_secret.' }),
                };
            }
        }

        const { model, prompt, api_key, max_tokens } = body;

        // Validate that essential parameters are present.
        if (!model || !prompt || !api_key) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing required parameters: model, prompt, or api_key.' }),
            };
        }

        // Retrieve the API URL from the environment variables.
        const apiUrl = 'https://api.openai.com/v1/chat/completions' 
       

        // Construct the payload for the external LLM API.
        const payload = {
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_completion_tokens: parseInt(max_tokens) || 3000,
        };

        // Set up the headers for the external API call.
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${api_key}`,
        };

        // Make the request to the external API using fetch.
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
        });

        // Check if the response from the external API was successful.
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error from external API:', response.status, errorText);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: 'Failed to proxy request to external API.', details: errorText }),
            };
        }

        // Parse the JSON response from the external API.
        const data = await response.json();

        // Return the data from the external API as the Lambda function's response.
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        };

    } catch (error) {
        // Catch any errors that occur during execution and return a 500 status code.
        console.error('Lambda function error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error', details: error.message }),
        };
    }
};
