# Fix: Vite Build Error - terser not found

If you get an error during build:
```
[vite:terser] terser not found. Since Vite v3, terser has become an optional dependency.
```

## Quick Fix

```bash
cd ~/project_iDT_2/frontend/tree-forge-ui

# Method 1: Install terser (for better minification)
npm install --save-dev terser
npm run build

# Method 2: Use esbuild minification (already configured, faster)
# The vite.config.ts is already updated to use esbuild
# Just run build:
VITE_API_BASE_URL=/api npm run build
```

## What Changed

The `vite.config.ts` has been updated to use `esbuild` for minification instead of `terser`. Esbuild is:
- Faster
- Built into Vite
- No additional dependencies needed

If you prefer terser (slightly better compression):
```bash
npm install --save-dev terser
```

Then update `vite.config.ts`:
```typescript
minify: mode === "production" ? "terser" : false,
```

## Clean Install with Terser

The `clean_install.sh` script has been updated to optionally install terser:

```bash
chmod +x clean_install.sh
./clean_install.sh
```

