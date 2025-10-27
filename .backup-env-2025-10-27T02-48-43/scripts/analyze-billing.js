#!/usr/bin/env node
/**
 * Analyze billing data to find the source of high costs
 * Usage: node scripts/analyze-billing.js <email>
 */

require('dotenv').config();
const { getUserBillingData } = require('../src/services/google-sheets-logger');

async function analyzeBilling(email) {
    try {
        console.log(`\n🔍 Analyzing billing data for: ${email}\n`);
        
        const billingData = await getUserBillingData(email);
        
        if (!billingData || !billingData.transactions) {
            console.log('❌ No billing data found');
            return;
        }
        
        const transactions = billingData.transactions;
        console.log(`📊 Total transactions: ${transactions.length}\n`);
        
        // Find highest cost transactions
        const sortedByCost = [...transactions]
            .filter(t => t.type !== 'credit_added')
            .sort((a, b) => b.cost - a.cost);
        
        console.log('💰 Top 10 most expensive transactions:');
        console.log('─'.repeat(100));
        sortedByCost.slice(0, 10).forEach((tx, i) => {
            console.log(`${i + 1}. $${tx.cost.toFixed(4)} - ${tx.type} - ${tx.provider}/${tx.model} - ${tx.timestamp}`);
            console.log(`   Tokens: in=${tx.tokensIn}, out=${tx.tokensOut}, total=${tx.totalTokens || (tx.tokensIn + tx.tokensOut)}`);
        });
        
        // Summary by type
        console.log('\n\n📋 Summary by Type:');
        console.log('─'.repeat(100));
        const byType = {};
        transactions.forEach(tx => {
            if (!byType[tx.type]) byType[tx.type] = { count: 0, totalCost: 0 };
            byType[tx.type].count++;
            byType[tx.type].totalCost += tx.cost;
        });
        Object.entries(byType)
            .sort((a, b) => b[1].totalCost - a[1].totalCost)
            .forEach(([type, data]) => {
                console.log(`${type}: ${data.count} transactions, $${data.totalCost.toFixed(2)} total, $${(data.totalCost / data.count).toFixed(4)} avg`);
            });
        
        // Summary by provider
        console.log('\n\n🏢 Summary by Provider:');
        console.log('─'.repeat(100));
        const byProvider = {};
        transactions.forEach(tx => {
            if (tx.type === 'credit_added') return;
            if (!byProvider[tx.provider]) byProvider[tx.provider] = { count: 0, totalCost: 0 };
            byProvider[tx.provider].count++;
            byProvider[tx.provider].totalCost += tx.cost;
        });
        Object.entries(byProvider)
            .sort((a, b) => b[1].totalCost - a[1].totalCost)
            .forEach(([provider, data]) => {
                console.log(`${provider}: ${data.count} calls, $${data.totalCost.toFixed(2)} total, $${(data.totalCost / data.count).toFixed(4)} avg`);
            });
        
        // Check for anomalies
        console.log('\n\n⚠️  Anomaly Detection:');
        console.log('─'.repeat(100));
        
        const avgCost = sortedByCost.reduce((sum, tx) => sum + tx.cost, 0) / sortedByCost.length;
        const anomalies = sortedByCost.filter(tx => tx.cost > avgCost * 10);
        
        if (anomalies.length > 0) {
            console.log(`Found ${anomalies.length} transactions with cost > 10x average ($${avgCost.toFixed(4)})`);
            anomalies.slice(0, 5).forEach(tx => {
                console.log(`  • $${tx.cost.toFixed(4)} - ${tx.type} - ${tx.provider}/${tx.model}`);
                console.log(`    Timestamp: ${tx.timestamp}`);
                console.log(`    Tokens: in=${tx.tokensIn}, out=${tx.tokensOut}`);
            });
        } else {
            console.log('No major anomalies detected');
        }
        
        // Total balance
        const totalSpent = transactions
            .filter(t => t.type !== 'credit_added')
            .reduce((sum, tx) => sum + tx.cost, 0);
        const totalCredits = transactions
            .filter(t => t.type === 'credit_added')
            .reduce((sum, tx) => sum + Math.abs(tx.cost), 0);
        
        console.log('\n\n💳 Balance Summary:');
        console.log('─'.repeat(100));
        console.log(`Total Credits Added: $${totalCredits.toFixed(2)}`);
        console.log(`Total Spent: $${totalSpent.toFixed(2)}`);
        console.log(`Current Balance: $${(totalCredits - totalSpent).toFixed(2)}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

const email = process.argv[2] || 'awsroot.syntithenai@gmail.com';
analyzeBilling(email);
