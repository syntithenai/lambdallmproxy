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
                                    enum: ['resize', 'rotate', 'flip', 'format', 'filter', 'crop', 'autocrop', 'facedetect', 'modulate', 'extend', 'trim', 'tint', 'gamma', 'generate'],
                                    description: `Type of image operation to perform:
- "resize": Scale or change dimensions (e.g., "make smaller", "resize to 800px")
- "rotate": Rotate image (e.g., "rotate right", "turn 90 degrees")  
- "flip": Mirror or flip image (e.g., "flip horizontally", "mirror")
- "format": Convert file format (NOTE: all images auto-convert to WebP, but kept for compatibility)
- "filter": Apply visual filter (e.g., "grayscale", "blur", "sharpen", "sepia", "normalize/enhance")
- "crop": Manual crop to specific region with coordinates
- "autocrop": AI-powered intelligent cropping to main subject (requires AI provider)
- "facedetect": AI-powered face detection and crop (requires AI provider)
- "modulate": Adjust brightness, saturation, or hue (e.g., "brighter", "more saturated", "hue shift")
- "extend": Add borders/padding around image (e.g., "add white border", "add padding")
- "trim": Remove edges from image
- "tint": Apply color tint overlay
- "gamma": Adjust gamma correction for brightness/contrast
- "generate": AI-powered content modification. ALWAYS USE THIS for:
  * Adding ANY new object: "add glasses", "add a dog", "add person", "add flowers"
  * Changing ANYTHING in the image: "change background", "make smile", "different color"
  * Preserving original: "keep original", "add glasses over eyes", "overlay"
  * Keywords requiring generate: "add", "place", "put", "insert", "change", "modify", "keep original", "overlay"
  * If the user mentions keeping/preserving the original image, they want AI editing (generate)
  * If unsure whether to use "generate" or another type, USE "generate"`
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
                                            description: 'Rotation angle in degrees. MUST be exactly 90, 180, or 270. Use 90 for "rotate right/clockwise", 270 for "rotate left/counterclockwise", 180 for "rotate 180/upside down/flip upside down"'
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
                                            enum: ['grayscale', 'sepia', 'blur', 'sharpen', 'normalize', 'negate'],
                                            description: 'Filter to apply. Use "grayscale" for "black and white", "sepia" for "vintage/old photo", "blur" for "blur/soften", "sharpen" for "sharpen/enhance", "normalize" for "auto enhance/improve", "negate" for "invert colors"'
                                        },
                                        strength: {
                                            type: 'number',
                                            description: 'Filter strength/intensity (1-10, default 5 for blur, 1 for sharpen)'
                                        },
                                        // Crop params
                                        left: {
                                            type: 'number',
                                            description: 'Left edge position in pixels for crop'
                                        },
                                        top: {
                                            type: 'number',
                                            description: 'Top edge position in pixels for crop'
                                        },
                                        // Modulate params
                                        brightness: {
                                            type: 'number',
                                            description: 'Brightness multiplier (0.5 = darker, 1.0 = unchanged, 1.5 = brighter). Use 1.2 for +20%, 0.8 for -20%'
                                        },
                                        saturation: {
                                            type: 'number',
                                            description: 'Saturation multiplier (0.0 = grayscale, 1.0 = unchanged, 2.0 = double saturation). Use 1.5 for +50%, 0.5 for -50%'
                                        },
                                        hue: {
                                            type: 'number',
                                            description: 'Hue rotation in degrees (0-360). Use 90 for hue shift'
                                        },
                                        // Extend params (borders)
                                        right: {
                                            type: 'number',
                                            description: 'Right padding in pixels for extend/border'
                                        },
                                        bottom: {
                                            type: 'number',
                                            description: 'Bottom padding in pixels for extend/border'
                                        },
                                        background: {
                                            type: 'object',
                                            description: 'Background color for borders: {r: 0-255, g: 0-255, b: 0-255}. Use {r:255, g:255, b:255} for white, {r:0, g:0, b:0} for black',
                                            properties: {
                                                r: { type: 'number', description: 'Red (0-255)' },
                                                g: { type: 'number', description: 'Green (0-255)' },
                                                b: { type: 'number', description: 'Blue (0-255)' }
                                            }
                                        },
                                        // Tint params
                                        r: {
                                            type: 'number',
                                            description: 'Red component for tint (0-255)'
                                        },
                                        g: {
                                            type: 'number',
                                            description: 'Green component for tint (0-255)'
                                        },
                                        b: {
                                            type: 'number',
                                            description: 'Blue component for tint (0-255)'
                                        },
                                        // Gamma params
                                        gamma: {
                                            type: 'number',
                                            description: 'Gamma correction value (default 2.2, lower = darker, higher = brighter)'
                                        },
                                        // Autocrop/Facedetect params
                                        focus: {
                                            type: 'string',
                                            enum: ['center', 'face'],
                                            description: 'Focus area for AI cropping: "center" for main subject, "face" for face detection'
                                        },
                                        // Generate params (AI-powered modifications)
                                        prompt: {
                                            type: 'string',
                                            description: 'Text description of what to add or modify in the image. The AI will preserve the original image and add/modify as requested. Examples: "add glasses", "add a dog", "add flowers in the background", "change sky to sunset", "add a person wearing a hat", "add glasses over the eyes". If user mentions "keep original" or "preserve", extract ONLY the modification part (e.g., "keep original, add glasses" becomes "add glasses")'
                                        },
                                        mode: {
                                            type: 'string',
                                            enum: ['inpaint', 'outpaint', 'edit'],
                                            description: 'Generation mode: "edit" for general AI editing (default - use this for most requests), "inpaint" to add/modify specific areas, "outpaint" to extend image borders. When in doubt, use "edit".'
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
        { prompt: 'rotate 180', operations: [{ type: 'rotate', params: { degrees: 180 } }] },
        { prompt: 'rotate 180 degrees', operations: [{ type: 'rotate', params: { degrees: 180 } }] },
        { prompt: 'flip upside down', operations: [{ type: 'rotate', params: { degrees: 180 } }] },
        { prompt: 'rotate left', operations: [{ type: 'rotate', params: { degrees: 270 } }] },
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
        ]},
        { prompt: 'add a dog', operations: [{ type: 'generate', params: { prompt: 'add a dog', mode: 'inpaint' } }]},
        { prompt: 'add glasses to the cat', operations: [{ type: 'generate', params: { prompt: 'add glasses to the cat', mode: 'inpaint' } }]},
        { prompt: 'change background to sunset', operations: [{ type: 'generate', params: { prompt: 'change background to sunset', mode: 'edit' } }]},
        { prompt: 'add a person wearing a hat', operations: [{ type: 'generate', params: { prompt: 'add a person wearing a hat', mode: 'inpaint' } }]},
        { prompt: 'auto enhance', operations: [{ type: 'filter', params: { filter: 'normalize' } }]},
        { prompt: 'make it brighter', operations: [{ type: 'modulate', params: { brightness: 1.2 } }]},
        { prompt: 'increase brightness by 20%', operations: [{ type: 'modulate', params: { brightness: 1.2 } }]},
        { prompt: 'make it darker', operations: [{ type: 'modulate', params: { brightness: 0.8 } }]},
        { prompt: 'more saturated', operations: [{ type: 'modulate', params: { saturation: 1.5 } }]},
        { prompt: 'increase saturation by 50%', operations: [{ type: 'modulate', params: { saturation: 1.5 } }]},
        { prompt: 'less saturated', operations: [{ type: 'modulate', params: { saturation: 0.5 } }]},
        { prompt: 'hue shift', operations: [{ type: 'modulate', params: { hue: 90 } }]},
        { prompt: 'add white border', operations: [{ type: 'extend', params: { top: 20, bottom: 20, left: 20, right: 20, background: { r: 255, g: 255, b: 255 } } }]},
        { prompt: 'add black border', operations: [{ type: 'extend', params: { top: 20, bottom: 20, left: 20, right: 20, background: { r: 0, g: 0, b: 0 } } }]},
        { prompt: 'crop to face', operations: [{ type: 'facedetect', params: { focus: 'face' } }]},
        { prompt: 'auto crop', operations: [{ type: 'autocrop', params: { focus: 'center' } }]},
        { prompt: 'invert colors', operations: [{ type: 'filter', params: { filter: 'negate' } }]}
    ];
}

module.exports = {
    imageEditTools,
    parseImageEditCommand,
    getExampleCommands
};
