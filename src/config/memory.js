/**
 * Memory management configuration constants
 * Centralized memory limits and buffer settings
 */

// Memory management constants
// Infer memory limit from environment when possible
const LAMBDA_MEMORY_LIMIT_MB = (process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE && parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE, 10))
    || (process.env.LAMBDA_MEMORY && parseInt(process.env.LAMBDA_MEMORY, 10))
    || 128;

const MEMORY_SAFETY_BUFFER_MB = 16; // Reserve 16MB for other operations
const MAX_CONTENT_SIZE_MB = LAMBDA_MEMORY_LIMIT_MB - MEMORY_SAFETY_BUFFER_MB;
const BYTES_PER_MB = 1024 * 1024;

module.exports = {
    LAMBDA_MEMORY_LIMIT_MB,
    MEMORY_SAFETY_BUFFER_MB,
    MAX_CONTENT_SIZE_MB,
    BYTES_PER_MB
};