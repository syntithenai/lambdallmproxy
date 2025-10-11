const { getComprehensiveResearchSystemPrompt } = require('./src/config/prompts');

const prompt = getComprehensiveResearchSystemPrompt();
const chars = prompt.length;
const estimatedTokens = Math.ceil(chars / 4);
const originalTokens = 3449;
const reduction = originalTokens - estimatedTokens;
const percentReduction = Math.round((reduction / originalTokens) * 100);

console.log('\n╔════════════════════════════════════════════════════╗');
console.log('║   SYSTEM PROMPT OPTIMIZATION RESULTS               ║');
console.log('╚════════════════════════════════════════════════════╝\n');
console.log('  Original Prompt:');
console.log(`    - Tokens: 3,449`);
console.log(`    - Characters: 13,796\n`);
console.log('  Optimized Prompt:');
console.log(`    - Tokens: ${estimatedTokens.toLocaleString()}`);
console.log(`    - Characters: ${chars.toLocaleString()}\n`);
console.log('  Reduction:');
console.log(`    - Tokens: ${reduction.toLocaleString()} (${percentReduction}%)`);
console.log(`    - Characters: ${(13796 - chars).toLocaleString()}\n`);
console.log('  Target Range: 1,800-2,500 tokens');
console.log(`  Status: ${estimatedTokens >= 1800 && estimatedTokens <= 2500 ? '✅ PASS' : estimatedTokens < 1800 ? '⚡ EXCEEDED TARGET (even better!)' : '⚠️  OUT OF RANGE'}\n`);
console.log('════════════════════════════════════════════════════\n');

// Show the actual prompt
console.log('Optimized Prompt Content:\n');
console.log(prompt);
