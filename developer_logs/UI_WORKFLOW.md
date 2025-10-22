# UI Development Workflow - ALWAYS FOLLOW THESE STEPS

## 🎯 PRIMARY RULE FOR COPILOT
**When making ANY UI changes, ALWAYS apply them to the UI source files in the `ui/` folder, NOT to docs/, test.html, or any generated files.**

## 📁 UI Source File Structure
```
ui/
├── index_template_modular.html    # Main HTML template (PREFERRED)
├── index_template.html           # Legacy monolithic template
├── css/
│   └── styles.css               # All CSS styles
└── js/
    ├── utils.js                 # Utilities & real-time monitoring
    ├── auth.js                  # Google OAuth & authentication
    ├── settings.js              # Settings dialog & API keys
    ├── samples.js               # Sample queries
    ├── events.js                # Event processing & streaming
    ├── streaming.js             # Streaming response handling
    └── main.js                  # Main app logic & form handling
```

## 🔄 MANDATORY WORKFLOW
1. **Edit source files** in `ui/` folder ONLY
2. **Run build script**: `bash scripts/build-docs.sh`
3. **Test in docs/index.html** (the built version)

## ⚠️ CRITICAL REMINDERS
- **NEVER** edit `docs/index.html` directly - it gets overwritten!
- **NEVER** edit `test.html` for production changes
- **ALWAYS** modify `ui/index_template_modular.html` for HTML changes
- **ALWAYS** modify `ui/js/*.js` for JavaScript changes
- **ALWAYS** modify `ui/css/styles.css` for styling changes

## 🛠 Build Commands
```bash
# Rebuild UI (ALWAYS run after UI changes)
bash scripts/build-docs.sh

# Deploy UI to GitHub Pages
bash scripts/deploy-docs.sh

# Deploy Lambda function
bash scripts/deploy.sh
```

## 📋 Recent Features Added
✅ 5-row textarea height (was 8 rows)
✅ Real-time monitoring with expandable sections:
  - 🤖 LLM Query Activity
  - 🔧 Tool Usage Activity 
  - 🔍 Search Activity
  - ⚙️ System Events
✅ Query persistence to localStorage with default examples
✅ Cost/token information display
✅ Modular JavaScript architecture

## 🔧 Quick Reference Commands
```bash
# Make UI change workflow
cd /home/stever/projects/lambdallmproxy
# 1. Edit files in ui/ folder
# 2. Build
bash scripts/build-docs.sh
# 3. Test at http://localhost:8080/docs/
python3 -m http.server 8080
```

## 🚨 EMERGENCY FIXES
If UI is broken:
1. Check `ui/index_template_modular.html` syntax
2. Check JavaScript console for errors in `docs/js/` files
3. Rebuild: `bash scripts/build-docs.sh`
4. Compare with working backup in git history

---
**Remember: UI changes in `ui/` folder → Build → Test in `docs/`**