# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2025 Jonathan D.A. Jewell
# polyglot-container-mcp justfile

# Default recipe
default:
    @just --list

# Start the MCP server
start:
    deno run --allow-run --allow-read --allow-env index.js

# Start with watch mode for development
dev:
    deno run --watch --allow-run --allow-read --allow-env index.js

# Check syntax without running
check:
    deno check index.js

# Format all files
fmt:
    deno fmt

# Lint all files
lint:
    deno lint

# Run all validation checks
validate: check lint
    @echo "Validation complete"

# Cache dependencies
cache:
    deno cache index.js

# Build ReScript
res-build:
    npm run res:build

# Watch ReScript
res-watch:
    npm run res:build -- -w

# Clean generated files
clean:
    rm -rf node_modules .deno lib/es6

# Audit SPDX license headers
audit-licence:
    @echo "Checking SPDX headers..."
    @grep -L "SPDX-License-Identifier" *.js adapters/*.js || echo "All files have SPDX headers"

# Show project info
info:
    @echo "polyglot-container-mcp - Multi-runtime container management MCP server"
    @echo "Runtime: Deno"
    @echo "License: MIT"
    @echo "Runtimes: nerdctl, podman, docker"

# List supported runtimes
runtimes:
    @echo "Supported container runtimes:"
    @echo "  - nerdctl (containerd CLI) - FOSS preferred"
    @echo "  - podman (daemonless) - FOSS preferred"
    @echo "  - docker (fallback)"

# RSR compliance check
rsr-check:
    @echo "RSR Compliance Check"
    @echo "===================="
    @test -f LICENSE.txt && echo "✓ LICENSE.txt" || echo "✗ LICENSE.txt"
    @test -f SECURITY.adoc && echo "✓ SECURITY.adoc" || echo "✗ SECURITY.adoc"
    @test -f CODE_OF_CONDUCT.adoc && echo "✓ CODE_OF_CONDUCT.adoc" || echo "✗ CODE_OF_CONDUCT.adoc"
    @test -f CONTRIBUTING.adoc && echo "✓ CONTRIBUTING.adoc" || echo "✗ CONTRIBUTING.adoc"
    @test -f FUNDING.yml && echo "✓ FUNDING.yml" || echo "✗ FUNDING.yml"
    @test -f GOVERNANCE.adoc && echo "✓ GOVERNANCE.adoc" || echo "✗ GOVERNANCE.adoc"
    @test -f MAINTAINERS.adoc && echo "✓ MAINTAINERS.adoc" || echo "✗ MAINTAINERS.adoc"
    @test -f .gitattributes && echo "✓ .gitattributes" || echo "✗ .gitattributes"
    @test -d .well-known && echo "✓ .well-known/" || echo "✗ .well-known/"
    @test -f justfile && echo "✓ justfile" || echo "✗ justfile"

# Build container images
build-container variant="wolfi":
    podman build -t polyglot-container-mcp:{{variant}} -f Containerfile{{if variant != "wolfi"}}.{{variant}}{{else}}{{end}} .

# Build all container variants
build-all:
    just build-container wolfi
    just build-container alpine
    just build-container fedora
