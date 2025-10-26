# FEATURE_SWAG_TAG_FILTER_AUTOSUGGEST.md

## Feature: Replace Tag Filter List with Autosuggest in SWAG Search Bar

### Background
The SWAG search bar currently displays a list of all available tags for filtering. This list can become very large and takes up excessive space, especially on mobile devices. The user experience is cluttered and not scalable for users with many tags.

### Requirements
- On desktop, show only the five most recently used tags as quick filter pills.
- On both desktop and mobile, replace the full tag list with an autosuggest (autocomplete) input for selecting and adding tags to the filter.
- The autosuggest should:
  - Show matching tags as the user types
  - Allow keyboard and mouse selection
  - Add selected tags to the filter list
  - Prevent duplicate tags in the filter
- The UI should remain compact and mobile-friendly.
- Remove the current full tag list from the search bar.

### Implementation Plan
1. **Component Selection**
   - Use an existing autosuggest/autocomplete component (e.g., [Downshift](https://www.downshift-js.com/), [React Autocomplete](https://react-autocomplete.github.io/react-autocomplete/), or a simple custom solution).
   - Ensure accessibility and keyboard navigation.

2. **State Management**
   - Maintain a list of recently used tags (persisted in localStorage or in-memory per session).
   - Update the recent tags list whenever a tag is added to the filter.
   - Filter out tags already in the filter from the autosuggest options.

3. **UI Changes**
   - Remove the current tag list from the search bar.
   - Add the autosuggest input for tag filtering.
   - On desktop, display up to five most recently used tags as pills for quick filtering.
   - On mobile, only show the autosuggest input (no pills).

4. **Integration**
   - When a tag is selected from autosuggest, add it to the filter and update recent tags.
   - Allow removing tags from the filter as currently implemented.

5. **Testing**
   - Test on both desktop and mobile viewports.
   - Ensure keyboard and screen reader accessibility.
   - Validate that only five recent tags are shown on desktop, and none on mobile.
   - Confirm that the autosuggest works with large tag lists.

### Acceptance Criteria
- [ ] Autosuggest input replaces the tag list in the search bar.
- [ ] Only five most recently used tags are shown as pills on desktop.
- [ ] No tag list or pills are shown on mobile, only the autosuggest.
- [ ] Autosuggest is accessible and works with keyboard/mouse.
- [ ] Tag filter state updates correctly and persists recent tags.
- [ ] UI is compact and mobile-friendly.

---
See also: developer_log/FEATURE_SWAG_UI_IMPROVEMENTS.md
