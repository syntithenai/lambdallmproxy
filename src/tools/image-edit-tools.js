/**
 * Image Edit Tool Definitions
 * LLM tools for parsing natural language image editing commands
 */

const imageEditTools = [
    {
        type: 'function',
        function: {
            name: 'edit_images',
            description: 'Apply image editing operations including traditional edits (resize, rotate, flip, format, filters) and AI-powered generative modifications (adding objects, changing backgrounds, content editing) based on natural language commands',
            parameters: {
                type: 'object',
                properties: {
                    operations: {
                        type: 'array',
                        description: 'Array of image editing operations to apply in sequence',
                        items: {
                            type: 'object',
                            properties: {
                                type: {
                                    type: 'string',
                                    enum: ['resize', 'rotate', 'flip', 'format', 'filter', 'generate'],
                                    description: 'Type of image operation to perform. Use "generate" for AI-powered modifications like adding objects, changing backgrounds, or modifying content.'
                                },
                                params: {
                                    type: 'object',
                                    description: 'Parameters for the operation',
                                    properties: {
                                        // Resize params
                                        percentage: {
                                            type: 'number',
                                            description: 'Scale percentage (25, 50, 75, 100, 150, 200). Use for commands like "make smaller" (50), "make bigger" (150), "half size" (50), "double size" (200), "quarter size" (25)'
                                        },
                                        width: {
                                            type: 'number',
                                            description: 'Target width in pixels (optional, used with height for exact dimensions)'
                                        },
                                        height: {
                                            type: 'number',
                                            description: 'Target height in pixels (optional, used with width for exact dimensions)'
                                        },
                                        // Rotate params
                                        degrees: {
                                            type: 'number',
                                            enum: [90, 180, 270],
                                            description: 'Rotation angle in degrees. Use 90 for "rotate right/clockwise", 270 for "rotate left/counterclockwise", 180 for "rotate 180/upside down"'
                                        },
                                        // Flip params
                                        direction: {
                                            type: 'string',
                                            enum: ['horizontal', 'vertical'],
                                            description: 'Flip direction. Use "horizontal" for "flip horizontally/mirror", "vertical" for "flip vertically/upside down"'
                                        },
                                        // Format params
                                        format: {
                                            type: 'string',
                                            enum: ['jpg', 'png', 'webp'],
                                            description: 'Target image format for conversion'
                                        },
                                        quality: {
                                            type: 'number',
                                            description: 'Quality for lossy formats (1-100, default 80)'
                                        },
                                        // Filter params
                                        filter: {
                                            type: 'string',
                                            enum: ['grayscale', 'sepia', 'blur', 'sharpen'],
                                            description: 'Filter to apply. Use "grayscale" for "black and white", "sepia" for "vintage/old photo", "blur" for "blur/soften", "sharpen" for "sharpen/enhance"'
                                        },
                                        strength: {
                                            type: 'number',
                                            description: 'Filter strength/intensity (1-10, default 5 for blur, 1 for sharpen)'
                                        },
                                        // Generate params (AI-powered modifications)
                                        prompt: {
                                            type: 'string',
                                            description: 'Text description of what to add or modify in the image. Examples: "add a dog", "add flowers in the background", "change sky to sunset", "add a person wearing a hat"'
                                        },
                                        mode: {
                                            type: 'string',
                                            enum: ['inpaint', 'outpaint', 'edit'],
                                            description: 'Generation mode: "inpaint" to add/modify specific areas, "outpaint" to extend image borders, "edit" for general AI editing'
                                        }
                                    }
                                }
                            },
                            required: ['type', 'params']
                        }
                    }
                },
                required: ['operations']
            }
        }
    }
];

/**
 * Parse natural language command into image operations
 * This is called by the LLM via tool use
 */
function parseImageEditCommand(toolCall) {
    try {
        console.log('🔍 [parseImageEditCommand] Input:', JSON.stringify(toolCall, null, 2));
        const args = typeof toolCall.arguments === 'string' 
            ? JSON.parse(toolCall.arguments) 
            : toolCall.arguments;
        
        console.log('🔍 [parseImageEditCommand] Parsed args:', JSON.stringify(args, null, 2));
        console.log('🔍 [parseImageEditCommand] Operations:', args.operations);
        
        return {
            success: true,
            operations: args.operations || [],
            message: `Parsed ${args.operations?.length || 0} operations`
        };
    } catch (error) {
        console.error('❌ Failed to parse image edit command:', error);
        console.error('❌ Tool call that failed:', JSON.stringify(toolCall, null, 2));
        return {
            success: false,
            error: error.message,
            operations: []
        };
    }
}

/**
 * Get example prompts for testing
 */
function getExampleCommands() {
    return [
        { prompt: 'make the image smaller', operations: [{ type: 'resize', params: { percentage: 50 } }] },
        { prompt: 'resize to 50%', operations: [{ type: 'resize', params: { percentage: 50 } }] },
        { prompt: 'make it bigger', operations: [{ type: 'resize', params: { percentage: 150 } }] },
        { prompt: 'rotate right', operations: [{ type: 'rotate', params: { degrees: 90 } }] },
        { prompt: 'rotate 90 degrees clockwise', operations: [{ type: 'rotate', params: { degrees: 90 } }] },
        { prompt: 'flip horizontally', operations: [{ type: 'flip', params: { direction: 'horizontal' } }] },
        { prompt: 'mirror the image', operations: [{ type: 'flip', params: { direction: 'horizontal' } }] },
        { prompt: 'convert to jpg', operations: [{ type: 'format', params: { format: 'jpg' } }] },
        { prompt: 'make it black and white', operations: [{ type: 'filter', params: { filter: 'grayscale' } }] },
        { prompt: 'apply sepia tone', operations: [{ type: 'filter', params: { filter: 'sepia' } }] },
        { prompt: 'make it smaller and rotate right', operations: [
            { type: 'resize', params: { percentage: 50 } },
            { type: 'rotate', params: { degrees: 90 } }
        ]},
        { prompt: 'resize to 25%, convert to webp, and sharpen', operations: [
            { type: 'resize', params: { percentage: 25 } },
            { type: 'format', params: { format: 'webp' } },
            { type: 'filter', params: { filter: 'sharpen', strength: 1 } }
        ]}
    ];
}

module.exports = {
    imageEditTools,
    parseImageEditCommand,
    getExampleCommands
};
