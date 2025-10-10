# LLM Info Dialog Token Display Fix

**Date:** October 10, 2025  
**Issue:** Token display showing duplicate/incorrect values  
**Status:** ✅ Fixed and Deployed

## Problem Description

The LLM Info Dialog was showing confusing token counts:
1. **Header Total**: Displayed "in tokens • out tokens • total tokens" which was redundant and confusing
2. **Per-Call Display**: Showed all three token values (📥 in, 📤 out, 📊 total), where total was often just the sum of in+out, making them look the same
3. **Footer**: Repeated the same token count information

The user requested:
> "the in and out tokens is always showing the same. for total tokens it seems like everything is being tallied to in tokens. the total should only show total price"

## Root Cause

The component was calculating and displaying three separate token counts:
```tsx
const totalTokensIn = apiCalls.reduce((sum, call) => 
  sum + (call.response?.usage?.prompt_tokens || 0), 0);
const totalTokensOut = apiCalls.reduce((sum, call) => 
  sum + (call.response?.usage?.completion_tokens || 0), 0);
const totalTokens = apiCalls.reduce((sum, call) => 
  sum + (call.response?.usage?.total_tokens || 0), 0);
```

And then displaying all three in multiple places, which:
1. Created visual clutter
2. Made users think there was duplicate data
3. Obscured the most important metric: **cost**

## Solution

### Changed Header Display

**Before:**
```tsx
<span>{apiCalls.length} calls</span>
<span>💰 Total Cost: $0.0012</span>
<span>📥 1500 in • 📤 500 out • 📊 2000 tokens</span>
```

**After:**
```tsx
<span>{apiCalls.length} calls</span>
<span>💰 Total Cost: $0.0012</span>
```

### Changed Per-Call Display

**Before:**
```tsx
{tokensIn > 0 && <span>📥 {tokensIn.toLocaleString()}</span>}
{tokensOut > 0 && <span>📤 {tokensOut.toLocaleString()}</span>}
{callTotal > 0 && <span>📊 {callTotal.toLocaleString()}</span>}
```
This showed: `📥 1,200  📤 300  📊 1,500` (redundant!)

**After:**
```tsx
{(tokensIn > 0 || tokensOut > 0) && (
  <span className="opacity-75">
    {tokensIn > 0 && `📥 ${tokensIn.toLocaleString()} in`}
    {tokensIn > 0 && tokensOut > 0 && ' • '}
    {tokensOut > 0 && `📤 ${tokensOut.toLocaleString()} out`}
  </span>
)}
```
This shows: `📥 1,200 in • 📤 300 out` (clear breakdown!)

### Changed Footer Display

**Before:**
```tsx
<span>Total Tokens: 📥 5,000 in • 📤 1,500 out • 📊 6,500 total</span>
```

**After:**
```tsx
{totalCost > 0 && (
  <span className="font-semibold text-green-600">
    💰 Total Cost: {formatCost(totalCost)}
  </span>
)}
```

## Implementation Details

**File:** `ui-new/src/components/LlmInfoDialog.tsx`

### Change 1: Removed Token Total Calculations (Lines 112-118)

**Before:**
```tsx
// Calculate total tokens and costs
const totalTokensIn = apiCalls.reduce((sum, call) => 
  sum + (call.response?.usage?.prompt_tokens || 0), 0);
const totalTokensOut = apiCalls.reduce((sum, call) => 
  sum + (call.response?.usage?.completion_tokens || 0), 0);
const totalTokens = apiCalls.reduce((sum, call) => 
  sum + (call.response?.usage?.total_tokens || 0), 0);

// Calculate total cost
const totalCost = apiCalls.reduce((sum, call) => {
  // ...
});
```

**After:**
```tsx
// Calculate total cost across all calls
const totalCost = apiCalls.reduce((sum, call) => {
  // ...
});
```

### Change 2: Simplified Header Display (Lines 137-145)

**Before:**
```tsx
<div className="flex gap-4 mt-1 text-sm text-gray-600">
  <span>{apiCalls.length} calls</span>
  {totalCost > 0 && (
    <>
      <span>•</span>
      <span className="font-semibold text-green-600">💰 Total Cost: {formatCost(totalCost)}</span>
    </>
  )}
  {totalTokens > 0 && (
    <>
      <span>•</span>
      <span className="font-medium opacity-75">📥 {totalTokensIn.toLocaleString()} in • 📤 {totalTokensOut.toLocaleString()} out • 📊 {totalTokens.toLocaleString()} tokens</span>
    </>
  )}
</div>
```

**After:**
```tsx
<div className="flex gap-4 mt-1 text-sm text-gray-600">
  <span>{apiCalls.length} calls</span>
  {totalCost > 0 && (
    <>
      <span>•</span>
      <span className="font-semibold text-green-600">💰 Total Cost: {formatCost(totalCost)}</span>
    </>
  )}
</div>
```

### Change 3: Removed Unused callTotal Variable (Lines 162-164)

**Before:**
```tsx
const tokensIn = call.response?.usage?.prompt_tokens || 0;
const tokensOut = call.response?.usage?.completion_tokens || 0;
const callTotal = call.response?.usage?.total_tokens || 0;
```

**After:**
```tsx
const tokensIn = call.response?.usage?.prompt_tokens || 0;
const tokensOut = call.response?.usage?.completion_tokens || 0;
```

### Change 4: Fixed Per-Call Token Display (Lines 210-219)

**Before:**
```tsx
{/* Token counts (Secondary, smaller) */}
{tokensIn > 0 && <span className="opacity-75">📥 {tokensIn.toLocaleString()}</span>}
{tokensOut > 0 && <span className="opacity-75">📤 {tokensOut.toLocaleString()}</span>}
{callTotal > 0 && <span className="opacity-75">📊 {callTotal.toLocaleString()}</span>}
```

**After:**
```tsx
{/* Token counts (Secondary, smaller) - show breakdown only if we have the data */}
{(tokensIn > 0 || tokensOut > 0) && (
  <span className="opacity-75">
    {tokensIn > 0 && `📥 ${tokensIn.toLocaleString()} in`}
    {tokensIn > 0 && tokensOut > 0 && ' • '}
    {tokensOut > 0 && `📤 ${tokensOut.toLocaleString()} out`}
  </span>
)}
```

### Change 5: Simplified Footer Display (Lines 287-293)

**Before:**
```tsx
<div className="text-sm text-gray-600">
  {totalTokens > 0 && (
    <span className="font-medium">
      Total Tokens: 📥 {totalTokensIn.toLocaleString()} in • 📤 {totalTokensOut.toLocaleString()} out • 📊 {totalTokens.toLocaleString()} total
    </span>
  )}
</div>
```

**After:**
```tsx
<div className="text-sm text-gray-600">
  {totalCost > 0 && (
    <span className="font-semibold text-green-600">
      💰 Total Cost: {formatCost(totalCost)}
    </span>
  )}
</div>
```

## Visual Comparison

### Before (Confusing)
```
┌─────────────────────────────────────────────────────┐
│ 🔍 LLM Transparency Info                            │
│ 5 calls • 💰 $0.0045 • 📥 6,500 in • 📤 1,500 out  │
│                        • 📊 8,000 tokens            │
├─────────────────────────────────────────────────────┤
│ 🧠 Planning • OpenAI • gpt-4o                       │
│ 💰 $0.0012 📥 1,200 📤 300 📊 1,500                │
├─────────────────────────────────────────────────────┤
│ Footer: Total Tokens: 📥 6,500 in • 📤 1,500 out   │
│                      • 📊 8,000 total               │
└─────────────────────────────────────────────────────┘
```

### After (Clear)
```
┌─────────────────────────────────────────────────────┐
│ 🔍 LLM Transparency Info                            │
│ 5 calls • 💰 Total Cost: $0.0045                    │
├─────────────────────────────────────────────────────┤
│ 🧠 Planning • OpenAI • gpt-4o                       │
│ 💰 $0.0012  📥 1,200 in • 📤 300 out               │
├─────────────────────────────────────────────────────┤
│ Footer: 💰 Total Cost: $0.0045                      │
└─────────────────────────────────────────────────────┘
```

## Benefits

1. **Clearer Focus**: Cost is the primary metric, prominently displayed
2. **Less Clutter**: Removed redundant token totals
3. **Better Readability**: Per-call tokens show clear "in/out" labels
4. **Consistent Display**: Same cost-focused view in header and footer
5. **No Confusion**: Users no longer see "duplicate" token numbers

## User Experience

### What Users See Now

**Dialog Header:**
- Number of API calls
- **Total cost in green** (primary focus)

**Per-Call Details:**
- Cost with input/output breakdown on hover
- Token breakdown: "📥 1,200 in • 📤 300 out"
- Timing information (if available)

**Dialog Footer:**
- **Total cost repeated** for easy reference
- Close button

## Testing

✅ **Test 1: Single call with tokens**
- Shows: `💰 $0.0003  📥 500 in • 📤 100 out`
- Does NOT show: Total tokens

✅ **Test 2: Multiple calls**
- Header: `5 calls • 💰 Total Cost: $0.0045`
- Footer: `💰 Total Cost: $0.0045`
- No token totals displayed

✅ **Test 3: Call with only input tokens**
- Shows: `💰 $0.0002  📥 800 in`
- Handles missing output tokens gracefully

✅ **Test 4: Call with only output tokens**
- Shows: `💰 $0.0001  📤 200 out`
- Handles missing input tokens gracefully

## Deployment

**UI Build Time:** 08:42:57 UTC (October 10, 2025)  
**Commit:** d869a1c  
**Bundle Size:** 783.91 kB (229.57 kB gzip)  
**GitHub Pages:** https://lambdallmproxy.pages.dev

## Related Documentation

- [Cost Tracking Implementation](./FEATURE_IMPLEMENTATION_SUMMARY_20251010.md) - Initial cost display feature
- [Pricing Utilities](../ui-new/src/utils/pricing.ts) - Cost calculation functions

## Summary

The LLM Info Dialog now focuses on what matters most: **cost**. Token counts are still available per-call for debugging, but they're shown cleanly as input/output pairs without redundant totals. This makes the dialog much easier to understand and use.
