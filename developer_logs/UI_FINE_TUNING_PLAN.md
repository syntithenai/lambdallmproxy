# UI Fine-Tuning Implementation Plan

## Requirements

1. **Remove OpenAI out token count** - Only show completion tokens for paid models
2. **JSON to tree or custom layout** - Improve JSON display, add HTML export
3. **Token and cost information in LLM transparency** - Show per-iteration and totals
4. **Show real price in chat response Info button** - Display actual cost prominently
5. **Web search expandable content** - Make search results collapsible/expandable

## Implementation Tasks

### Task 1: Update Pricing Display (High Priority)
**Files**: `ui-new/src/components/LlmInfoDialog.tsx`, `ui-new/src/components/LlmApiTransparency.tsx`

Changes:
- Show "📥 X in" instead of generic token counts
- Only show "📤 X out" for paid models (hide for free/Gemini)
- Emphasize cost over tokens
- Add "Real Cost" vs "Cost if Paid" for free models

### Task 2: Add Summary Statistics (High Priority)
**Files**: `ui-new/src/components/LlmApiTransparency.tsx`, `ui-new/src/components/LlmInfoDialog.tsx`

Changes:
- Add footer with totals:
  - Total tokens (in/out)
  - Total cost
  - Total duration
- Show per-iteration summaries clearly

### Task 3: Improve JSON Display (Medium Priority)
**Files**: `ui-new/src/components/JsonTree.tsx` (if exists), new component

Changes:
- Better tree rendering with icons
- Add "Export as HTML" button
- Syntax highlighting
- Collapsible sections with better UX

### Task 4: Chat Message Info Button (High Priority)
**Files**: `ui-new/src/components/ChatTab.tsx` (message rendering section)

Changes:
- Move cost to primary position
- Show: "💰 $0.0234 • 📊 1,234 tokens • ⏱️ 2.3s"
- Simplify token display (just total, not in/out)

### Task 5: Expandable Web Search Results (High Priority)
**Files**: `ui-new/src/components/ChatTab.tsx` (tool result rendering)

Changes:
- Make search_web results collapsible by default
- Show preview: "🔍 Found 5 results • Click to expand"
- Expandable with smooth animation
- Show URLs prominently when expanded

## File Changes Summary

| File | Changes | Priority |
|------|---------|----------|
| LlmInfoDialog.tsx | Update token display, add totals | HIGH |
| LlmApiTransparency.tsx | Update token display, add totals | HIGH |
| ChatTab.tsx | Update Info button, expandable search | HIGH |
| pricing.ts | Add "Cost if Paid" function | MEDIUM |
| JsonTree.tsx or new | Improve JSON display, HTML export | MEDIUM |

## Implementation Order

1. ✅ Update pricing display logic (both transparency components)
2. ✅ Add summary totals to transparency views
3. ✅ Update Chat Info button display
4. ✅ Make web search results expandable
5. ⏳ Improve JSON tree component
6. ⏳ Add HTML export functionality

## Testing Checklist

- [ ] Free models (Gemini) don't show out tokens
- [ ] Paid models (OpenAI) show in/out tokens
- [ ] Cost is primary, tokens secondary
- [ ] Totals shown at bottom of transparency view
- [ ] Chat Info button shows simplified view
- [ ] Search results are collapsible
- [ ] JSON tree is readable and exportable
