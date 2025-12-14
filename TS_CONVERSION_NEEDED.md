# JavaScript → ReScript Conversion Status

This repo uses ReScript for core logic with JavaScript entry points.

## Architecture

```
src/                    <- ReScript source (KEEP)
  Adapter.res           <- Core types
  Executor.res          <- Command execution
  bindings/Deno.res     <- Deno API bindings
lib/es6/                <- Compiled output (GENERATED)
adapters/*.js           <- TO CONVERT
server.js               <- Entry point (KEEP as thin wrapper)
transport/*.js          <- TO CONVERT
index.js                <- Legacy entry (REMOVE after server.js stable)
```

## Files to Convert to ReScript

### Priority 1: Adapters (core functionality)
- [ ] `adapters/nerdctl.js` → `src/adapters/Nerdctl.res`
- [ ] `adapters/podman.js` → `src/adapters/Podman.res`
- [ ] `adapters/docker.js` → `src/adapters/Docker.res`

### Priority 2: Transport (HTTP mode)
- [ ] `transport/streamable-http.js` → `src/transport/StreamableHttp.res`

### Keep as JavaScript (thin wrappers)
- `server.js` - Entry point, imports ReScript modules
- `index.js` - Legacy entry (deprecate after migration)

## Policy

- **REQUIRED**: ReScript for all NEW business logic
- **FORBIDDEN**: New TypeScript files
- **ALLOWED**: JavaScript entry points that import ReScript
- **ALLOWED**: Generated `.res.js` files in lib/es6/

## Build Commands

```bash
# Build ReScript
deno task res:build

# Watch mode
deno task res:watch
```

## Conversion Notes

When converting adapters:
1. Use `src/Adapter.res` module type
2. Use `src/Executor.res` for command execution
3. Use `src/bindings/Deno.res` for Deno APIs
4. Output goes to `lib/es6/`
5. Import in server.js as `./lib/es6/src/adapters/Nerdctl.res.js`
