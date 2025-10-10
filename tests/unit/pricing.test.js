/**
 * Test pricing scraper functionality
 */

const { loadAllPricing, calculateLLMCost, scrapeOpenAIPricing, scrapeGroqPricing } = require('../../src/pricing');

describe('Pricing Module', () => {
    
    describe('Pricing Data Loading', () => {
        test('should load pricing data for all providers', async () => {
            const pricing = await loadAllPricing();
            
            expect(pricing).toHaveProperty('openai');
            expect(pricing).toHaveProperty('groq');
            expect(pricing).toHaveProperty('lastUpdated');
            
            // Check OpenAI pricing structure
            expect(pricing.openai).toHaveProperty('models');
            expect(pricing.openai).toHaveProperty('lastUpdated');
            
            // Check Groq pricing structure
            expect(pricing.groq).toHaveProperty('models');
            expect(pricing.groq).toHaveProperty('lastUpdated');
        }, 30000); // Allow 30 seconds for scraping
        
        test('should have pricing for common OpenAI models', async () => {
            const pricing = await scrapeOpenAIPricing();
            
            expect(pricing.models).toBeDefined();
            // Should have at least one model (fallback will provide defaults)
            expect(Object.keys(pricing.models).length).toBeGreaterThan(0);
            
            // Check that models have input/output pricing
            Object.values(pricing.models).forEach(modelPricing => {
                expect(modelPricing).toHaveProperty('input');
                expect(modelPricing).toHaveProperty('output');
                expect(typeof modelPricing.input).toBe('number');
                expect(typeof modelPricing.output).toBe('number');
                expect(modelPricing.input).toBeGreaterThan(0);
                expect(modelPricing.output).toBeGreaterThan(0);
            });
        }, 20000);
        
        test('should have pricing for common Groq models', async () => {
            const pricing = await scrapeGroqPricing();
            
            expect(pricing.models).toBeDefined();
            // Should have at least one model (fallback will provide defaults)
            expect(Object.keys(pricing.models).length).toBeGreaterThan(0);
            
            // Check that models have input/output pricing
            Object.values(pricing.models).forEach(modelPricing => {
                expect(modelPricing).toHaveProperty('input');
                expect(modelPricing).toHaveProperty('output');
                expect(typeof modelPricing.input).toBe('number');
                expect(typeof modelPricing.output).toBe('number');
                expect(modelPricing.input).toBeGreaterThan(0);
                expect(modelPricing.output).toBeGreaterThan(0);
            });
        }, 20000);
    });
    
    describe('Cost Calculations', () => {
        let pricingData;
        
        beforeAll(async () => {
            // Use mock pricing data for consistent testing
            pricingData = {
                openai: {
                    models: {
                        'gpt-4o': { input: 0.000005, output: 0.000015 },
                        'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 }
                    }
                },
                groq: {
                    models: {
                        'llama-3.3-70b-versatile': { input: 0.00000059, output: 0.00000079 },
                        'llama-3.1-8b-instant': { input: 0.00000005, output: 0.00000008 }
                    }
                }
            };
        });
        
        test('should calculate OpenAI GPT-4o cost correctly', () => {
            const result = calculateLLMCost('openai', 'gpt-4o', 1000, 500, pricingData);
            
            expect(result).not.toHaveProperty('error');
            expect(result.provider).toBe('openai');
            expect(result.model).toBe('gpt-4o');
            expect(result.inputTokens).toBe(1000);
            expect(result.outputTokens).toBe(500);
            expect(result.inputCost).toBeCloseTo(0.005, 8); // 1000 * 0.000005
            expect(result.outputCost).toBeCloseTo(0.0075, 8); // 500 * 0.000015
            expect(result.totalCost).toBeCloseTo(0.0125, 8);
        });
        
        test('should calculate Groq Llama cost correctly', () => {
            const result = calculateLLMCost('groq', 'llama-3.1-8b-instant', 2000, 1000, pricingData);
            
            expect(result).not.toHaveProperty('error');
            expect(result.provider).toBe('groq');
            expect(result.model).toBe('llama-3.1-8b-instant');
            expect(result.inputTokens).toBe(2000);
            expect(result.outputTokens).toBe(1000);
            expect(result.inputCost).toBeCloseTo(0.0001, 8); // 2000 * 0.00000005
            expect(result.outputCost).toBeCloseTo(0.00008, 8); // 1000 * 0.00000008
            expect(result.totalCost).toBeCloseTo(0.00018, 8);
        });
        
        test('should handle unknown provider', () => {
            const result = calculateLLMCost('unknown', 'some-model', 1000, 500, pricingData);
            
            expect(result).toHaveProperty('error');
            expect(result.error).toContain('No pricing data for provider');
        });
        
        test('should handle unknown model', () => {
            const result = calculateLLMCost('openai', 'unknown-model', 1000, 500, pricingData);
            
            expect(result).toHaveProperty('error');
            expect(result.error).toContain('No pricing data for model');
        });
        
        test('should handle case insensitive provider names', () => {
            const result = calculateLLMCost('OpenAI', 'gpt-4o', 1000, 500, pricingData);
            
            expect(result).not.toHaveProperty('error');
            expect(result.provider).toBe('OpenAI');
            expect(result.totalCost).toBe(0.0125);
        });
    });
});