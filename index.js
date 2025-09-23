// Export the handler from the main Lambda function file
const { handler } = require('./lambda_search_llm_handler');
exports.handler = handler;