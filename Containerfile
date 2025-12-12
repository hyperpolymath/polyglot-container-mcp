# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2025 Jonathan D.A. Jewell

# polyglot-container-mcp - Wolfi Base (Primary)
# Minimal, secure container image using Wolfi (FOSS, no auth required)

FROM ghcr.io/wolfi-dev/wolfi-base:latest

LABEL org.opencontainers.image.title="polyglot-container-mcp"
LABEL org.opencontainers.image.description="Multi-runtime container management MCP server (nerdctl, podman, docker)"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.authors="Jonathan D.A. Jewell"
LABEL org.opencontainers.image.source="https://github.com/hyperpolymath/polyglot-container-mcp"
LABEL org.opencontainers.image.licenses="MIT"
LABEL dev.mcp.server="true"

# Install Deno
RUN apk add --no-cache deno ca-certificates

# Create non-root user
RUN adduser -D -u 1000 mcp
WORKDIR /app

# Copy application files
COPY --chown=mcp:mcp deno.json package.json ./
COPY --chown=mcp:mcp index.js ./
COPY --chown=mcp:mcp adapters/ ./adapters/
COPY --chown=mcp:mcp src/ ./src/
COPY --chown=mcp:mcp lib/ ./lib/ 2>/dev/null || true

# Cache dependencies
RUN deno cache --config=deno.json index.js

# Switch to non-root user
USER mcp

# Container CLIs (nerdctl, podman, docker) are expected to be:
# - Mounted from host, OR
# - Available via socket connection
ENV CONTAINER_RUNTIME=auto

ENTRYPOINT ["deno", "run", "--allow-run", "--allow-read", "--allow-env", "index.js"]
