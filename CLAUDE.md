# CLAUDE.md — AI Assistant Instructions

## Project Overview

**polyglot-container-mcp** is a unified MCP (Model Context Protocol) server providing access to multiple container runtimes (nerdctl, podman, docker) through a single interface. FOSS-first: nerdctl and podman are preferred over Docker.

## Quick Reference

```bash
# Start the server
deno task start

# Development with watch
deno task dev

# Build ReScript
deno task res:build
```

## Project State Files

This project uses Guile Scheme files for state tracking and meta-information:

- **STATE.scm** — Current project state, Dublin Core metadata, roadmap
- **META.scm** — Architectural decisions, development practices
- **ECOSYSTEM.scm** — Relationships with sibling projects
- **AI.scm** — AI assistant instructions and feedback channels

## Supported Container Runtimes

| Runtime | Type | Priority | Notes |
|---------|------|----------|-------|
| nerdctl | containerd CLI | FOSS Preferred | Docker-compatible, daemonless |
| podman | Daemonless | FOSS | Rootless-first design |
| docker | Docker CLI | Fallback | Included for compatibility |

## Architecture

```
index.js          — Main entry, MCP server setup
adapters/         — Runtime-specific adapters
  ├── nerdctl.js  — containerd/nerdctl (ReScript compiled)
  ├── podman.js   — Podman (ReScript compiled)
  └── docker.js   — Docker CLI (JavaScript fallback)
src/              — ReScript source
  ├── Executor.res    — Safe command execution
  ├── Adapter.res     — Adapter interface types
  └── bindings/       — Deno API bindings
lib/es6/          — Compiled ReScript output
```

## Adding a New Runtime Adapter

1. Create `src/adapters/YourRuntime.res` (or `adapters/yourruntime.js`)
2. Export: `name`, `description`, `connect()`, `disconnect()`, `isConnected()`, `tools`
3. Follow existing adapter patterns
4. Add SPDX header: `// SPDX-License-Identifier: MIT`
5. Import in `index.js`
6. Document environment variables in README

## Environment Variables

```bash
# Runtime selection
CONTAINER_RUNTIME    # Preferred: nerdctl, podman, docker (default: auto-detect)

# nerdctl
NERDCTL_PATH         # Path to binary
NERDCTL_NAMESPACE    # containerd namespace
NERDCTL_HOST         # containerd socket

# podman
PODMAN_PATH          # Path to binary
PODMAN_HOST          # Podman socket

# docker
DOCKER_PATH          # Path to binary
DOCKER_HOST          # Docker daemon socket
```

## Code Standards

- **License**: MIT with SPDX headers on all source files
- **Primary Language**: ReScript (compiled to ES6)
- **Fallback**: JavaScript for non-critical adapters
- **Style**: `deno fmt` for JavaScript formatting
- **No TypeScript**: TypeScript is prohibited (use ReScript instead)

## Security

- All commands executed via `Deno.Command` (not shell)
- Whitelist approach for allowed subcommands
- Argument sanitization to prevent injection
- No shell metacharacters allowed

## Quality Priorities

1. Security (command injection prevention)
2. FOSS-first (nerdctl/podman over Docker)
3. Interoperability (consistent API across runtimes)
4. Type safety (ReScript core)

## Related Projects

- [polyglot-db-mcp](https://github.com/hyperpolymath/polyglot-db-mcp) — Multi-database MCP server
- [Cerro-Torre](https://github.com/hyperpolymath/Cerro-Torre) — Supply-chain verified container distro
