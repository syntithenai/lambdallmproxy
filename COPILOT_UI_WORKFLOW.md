# Copilot UI Development Workflow

## 🚨 CRITICAL INSTRUCTIONS FOR UI CHANGES

**NEVER edit files in the `docs/` directory directly. These are built/generated files.**

### ✅ CORRECT UI Development Process

1. **Make UI changes in the `ui/` subdirectory:**
   - HTML changes: Edit `ui/index_template_modular.html` 
   - CSS changes: Edit `ui/styles.css`
   - JavaScript changes: Edit files in `docs/js/` directory (auth.js, main.js, settings.js, samples.js, utils.js)

2. **Build the UI after HTML/CSS changes:**
   ```bash
   ./scripts/build-docs.sh
   ```

3. **Deploy the changes:**
   ```bash
   ./scripts/deploy-docs.sh
   ```

4. **Alternative - Use Makefile (recommended):**
   ```bash
   make deploy-docs  # Builds and deploys in one command
   ```

### 📁 File Structure Understanding

```
lambdallmproxy/
├── ui/                                    # 🎯 SOURCE FILES - Edit these
│   ├── index_template_modular.html       # Main HTML template
│   ├── index_template.html               # Alternative template
│   └── styles.css                        # CSS styles
├── docs/                                  # ❌ BUILT FILES - Never edit directly
│   ├── index.html                        # Built from ui/ templates
│   └── js/                               # JavaScript modules (managed separately)
│       ├── auth.js                       # 🎯 Edit directly (not built from ui/)
│       ├── main.js                       # 🎯 Edit directly (not built from ui/)
│       ├── settings.js                   # 🎯 Edit directly (not built from ui/)
│       ├── samples.js                    # 🎯 Edit directly (not built from ui/)
│       └── utils.js                      # 🎯 Edit directly (not built from ui/)
└── scripts/
    ├── build-docs.sh                     # Builds ui/ → docs/
    └── deploy-docs.sh                    # Deploys docs/ to live site
```

### 🔄 JavaScript Development

JavaScript files in `docs/js/` are **NOT** built from `ui/` - they are managed independently:

- **To modify JavaScript functionality:** Edit files directly in `docs/js/`
- **After JavaScript changes:** Run `./scripts/deploy-docs.sh` to deploy
- **No build step needed** for JavaScript-only changes

### 🧪 Testing Workflow

1. Make changes in appropriate source files
2. Build if needed (HTML/CSS changes only)
3. Deploy with `./scripts/deploy-docs.sh`
4. Test at: https://lambdallmproxy.pages.dev

### ⚡ Quick Commands

```bash
# For HTML/CSS changes:
make deploy-docs    # Build ui/ → docs/ and deploy

# For JavaScript-only changes:
./scripts/deploy-docs.sh    # Deploy docs/ directly

# For Lambda code changes:
make dev    # Deploy Lambda function
```

### 🔍 Current UI Components Status

✅ **Properly implemented in source files:**
- Continue button with 60s countdown timer
- Compact UI layout with top bar
- Auto-resizing textarea
- Sample queries dropdown
- Google OAuth integration
- Toast notifications
- Quota/limits error handling

✅ **CSS styling for:**
- `.continue-btn` styles (green button with hover states)
- All compact layout styles
- Responsive design

✅ **JavaScript functionality in docs/js/:**
- `main.js`: Quota error handling, interrupt_state events, continue button logic
- `auth.js`: Google OAuth with background refresh
- `samples.js`: Sample queries dropdown
- `settings.js`: Settings management
- `utils.js`: Utility functions

### 📋 Deployment Checklist

Before making UI changes:
- [ ] Identify if change is HTML/CSS (edit ui/) or JavaScript (edit docs/js/)
- [ ] Make changes in correct source location
- [ ] Test changes locally if possible
- [ ] Build if HTML/CSS changed (`./scripts/build-docs.sh`)
- [ ] Deploy changes (`./scripts/deploy-docs.sh`)
- [ ] Test at live URL: https://lambdallmproxy.pages.dev

### 🚨 Common Mistakes to Avoid

❌ **DON'T:** Edit `docs/index.html` directly
❌ **DON'T:** Edit built CSS in `docs/index.html` 
❌ **DON'T:** Forget to build after HTML/CSS changes
❌ **DON'T:** Forget to deploy after changes

✅ **DO:** Edit `ui/index_template_modular.html` for HTML
✅ **DO:** Edit `ui/styles.css` for CSS  
✅ **DO:** Edit `docs/js/*.js` for JavaScript
✅ **DO:** Build and deploy after changes
✅ **DO:** Test changes on live site

## Summary

This workflow ensures all UI changes are properly managed in source files and built/deployed correctly. The continue button functionality and all quota error handling is now properly implemented in the source files and will persist through future builds.