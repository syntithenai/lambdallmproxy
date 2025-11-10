# Feed Search Criteria Persistence

## Problem
Feed search criteria (terms used to generate the current feed items) were lost when navigating away from the feed page or reloading the browser. This meant users would lose context about what they were viewing and infinite scroll would break.

## Solution
Implemented user-scoped localStorage persistence for `lastSearchCriteria` state using the existing userStorage utility.

## Implementation Details

### Changes Made

1. **FeedContext.tsx** - Added localStorage persistence hooks:
   - Import `getItem` and `setItem` from `../utils/userStorage`
   - Extract `user` from `useAuth()` hook
   - Added `useEffect` to save `lastSearchCriteria` to localStorage when it changes
   - Added `useEffect` to restore `lastSearchCriteria` from localStorage on mount
   - Both hooks are user-scoped (only run when `user?.email` is available)

2. **userStorage.ts** - Added new user-scoped key:
   - Added `'feed_last_search'` to `USER_SCOPED_KEYS` array
   - This ensures the key is properly cleared on logout via `clearUserStorage()`

### Code Pattern

```typescript
// Save to localStorage when lastSearchCriteria changes
useEffect(() => {
  if (lastSearchCriteria && user?.email) {
    setItem('feed_last_search', JSON.stringify(lastSearchCriteria));
  }
}, [lastSearchCriteria, user?.email]);

// Restore from localStorage on mount
useEffect(() => {
  if (user?.email) {
    const saved = getItem('feed_last_search');
    if (saved) {
      const criteria = JSON.parse(saved);
      setLastSearchCriteria(criteria);
    }
  }
}, [user?.email]);
```

### User-Scoped Storage

The implementation uses the existing `userStorage` utility which:
- Automatically prefixes keys with `user:${email}:`
- Ensures each user has isolated storage
- Automatically clears on logout via `clearUserStorage()`

### Storage Key Format

- **Logical key**: `feed_last_search`
- **Actual localStorage key**: `user:user@example.com:feed_last_search`

## Benefits

1. **Persistence Across Navigation**: Search criteria preserved when navigating to other tabs
2. **Persistence Across Reloads**: Search criteria preserved when browser refreshes
3. **Multi-User Support**: Each user has their own search criteria
4. **Security**: Automatically cleared on logout
5. **Infinite Scroll Continuity**: Feed can continue generating with same criteria

## Testing Checklist

- [x] Generate feed items with specific search terms
- [ ] Navigate to chat tab
- [ ] Navigate back to feed tab
- [ ] Verify search criteria restored
- [ ] Verify infinite scroll uses restored criteria
- [ ] Test with multiple users
- [ ] Verify logout clears search criteria
- [ ] Test browser reload

## Related Files

- `ui-new/src/contexts/FeedContext.tsx` - Feed state management with persistence
- `ui-new/src/utils/userStorage.ts` - User-scoped localStorage utility

## Date
2025-01-27
