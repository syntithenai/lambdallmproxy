# Quick Start - Local Development

## TL;DR

```bash
# Start everything (Lambda + UI)
make dev

# Then open: http://localhost:8081
```

That's it! 🎉

## What Just Happened?

1. **Lambda server** started on port 3000
2. **UI server** started on port 8081
3. UI automatically detects local Lambda and uses it
4. All your .env variables loaded automatically

## Stop Servers

Press `Ctrl+C` in the terminal - stops both servers.

## Separate Servers

```bash
# Terminal 1: Lambda only
make run-lambda-local

# Terminal 2: UI only
make serve-ui
```

## No Local Lambda?

If Lambda isn't running, UI automatically falls back to remote Lambda. No configuration needed.

## Reset to Try Local Again

In browser console:
```javascript
resetApiBase()
```

Then refresh page.

## URLs

- 🖥️ **UI**: http://localhost:8081
- ⚡ **Lambda**: http://localhost:3000
- 🏥 **Health**: http://localhost:3000/health

## Benefits

- ✅ No IP restrictions
- ✅ Fast iteration
- ✅ See logs in real-time
- ✅ No deployment needed
- ✅ Works offline (for backend)
- ✅ Automatic remote fallback

## Common Issues

**UI can't find Lambda?**
- Check Lambda is running: `ps aux | grep run-local-lambda`
- Start it: `make run-lambda-local`

**Port already in use?**
- Find process: `lsof -i :3000`
- Kill it: `kill <PID>`

**Still using remote?**
- Reset: `resetApiBase()` in browser console
- Refresh page

## Full Documentation

See [LOCAL_DEVELOPMENT_SETUP.md](LOCAL_DEVELOPMENT_SETUP.md) for complete details.
