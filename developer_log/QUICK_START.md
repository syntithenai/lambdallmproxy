# Quick Start Guide - New React UI

## 🚀 Get Started in 3 Steps

### 1. Install Dependencies
```bash
cd ui-new
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Opens at **http://localhost:5173**

### 3. Build for Production
```bash
npm run build
```
Output → `../docs/`

---

## 📱 Using the Application

### First Time Setup
1. **Open the app** in your browser
2. **Click "Sign in with Google"** (top right)
3. **Authenticate** with your Google account
4. **Start using** the three tabs!

### Chat Tab 💬
- Type a message → Press Enter (or click Send)
- **Save**: Click "💾 Save Chat" to save history
- **Load**: Click "📂 Load Chat" to restore saved chats
- **Templates**: Hover over "📝 Templates" for quick inserts

### Planning Tab 📋
- Type a research question
- Click "Generate Research Plan"
- When done, click "Transfer to Chat →" to use in chat

### Search Tab 🔍
- Enter search queries (click "➕ Add Query" for more)
- Click "🔍 Search All"
- Click "▼ Expand" on any result to see full content

### Settings ⚙️
- Click gear icon (top right)
- Adjust model, temperature, max tokens
- Settings auto-save to localStorage

---

## 🛠️ Development

### Project Structure
```
ui-new/
├── src/
│   ├── components/     # UI components
│   ├── contexts/       # React contexts
│   ├── hooks/          # Custom hooks
│   └── utils/          # Utilities
└── package.json
```

### Available Scripts
```bash
npm run dev         # Development server
npm run build       # Production build
npm run preview     # Preview production build
```

### Hot Reload
Changes to `.tsx` or `.css` files automatically reload in browser.

---

## 🐛 Troubleshooting

### "Port already in use"
```bash
# Kill process on port 5173
lsof -ti:5173 | xargs kill -9

# Or use different port
npm run dev -- --port 5174
```

### "Cannot find module"
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### "google is not defined"
- Check that Google OAuth script loads in `index.html`
- Open browser console to see error details

### Build errors
```bash
# Clear cache and rebuild
rm -rf node_modules/.vite
npm run build
```

---

## 📦 Deployment

### Quick Deploy
```bash
# From project root
./scripts/build-docs-new.sh

# Preview
cd docs
python3 -m http.server 8082
```

### GitHub Pages
```bash
# Build
cd ui-new && npm run build

# Push docs/ to gh-pages branch
cd ../docs
git add .
git commit -m "Update UI"
git push origin gh-pages
```

### Lambda Integration
1. Build: `npm run build`
2. Uploads docs/ to S3 or serves via Lambda static endpoint
3. Configure `VITE_API_BASE` if Lambda URL differs

---

## ⚙️ Configuration

### Environment Variables
Create `ui-new/.env`:
```bash
# API endpoint (empty = same origin)
VITE_API_BASE=

# For production
# VITE_API_BASE=https://your-lambda-url.com
```

### Tailwind Customization
Edit `tailwind.config.js`:
```javascript
theme: {
  extend: {
    colors: {
      primary: {
        // Your custom colors
      }
    }
  }
}
```

---

## 📚 Learn More

- **React Docs**: https://react.dev
- **Vite Docs**: https://vitejs.dev
- **Tailwind CSS v4**: https://tailwindcss.com/docs
- **TypeScript**: https://www.typescriptlang.org/docs

---

## ✨ Features Summary

✅ **Chat**: OpenAI-compatible, history, templates
✅ **Planning**: Research plans, transfer to chat
✅ **Search**: Parallel queries, expandable results
✅ **Settings**: Persistent preferences
✅ **Auth**: Google OAuth 2.0
✅ **Storage**: localStorage for everything
✅ **Responsive**: Mobile to TV screens
✅ **Modern**: React 19 + TypeScript + Tailwind

---

**Need help?** Check console logs - all API responses are logged!
