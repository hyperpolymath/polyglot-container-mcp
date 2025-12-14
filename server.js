#!/usr/bin/env -S deno run --allow-run --allow-read --allow-env --allow-net
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2025 Jonathan D.A. Jewell

/**
 * Polyglot Container MCP Server - Dual Mode Entry Point
 *
 * Supports both:
 * - STDIO transport (default, for local MCP clients)
 * - Streamable HTTP transport (for remote/cloud deployment)
 *
 * Usage:
 *   Local:  deno task start
 *   HTTP:   deno task serve
 *   Deploy: deno deploy (auto-detects HTTP mode)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHttpTransport } from "./transport/streamable-http.js";
import { z } from "zod";

// Import adapters
import * as nerdctl from "./adapters/nerdctl.js";
import * as podman from "./adapters/podman.js";
import * as docker from "./adapters/docker.js";

const PACKAGE_VERSION = "1.1.0";
const FEEDBACK_URL =
  "https://github.com/hyperpolymath/polyglot-container-mcp/issues";

// All available adapters
const adapters = { nerdctl, podman, docker };

// Track connected adapters
const connectedAdapters = new Map();

// Preferred runtime (can be set via env or tool)
let preferredRuntime = Deno.env.get("CONTAINER_RUNTIME") || null;

/**
 * Detect which container runtimes are available
 */
async function detectRuntimes() {
  const results = {};
  for (const [name, adapter] of Object.entries(adapters)) {
    try {
      const connected = await adapter.isConnected();
      results[name] = { available: connected, description: adapter.description };
    } catch {
      results[name] = { available: false, description: adapter.description };
    }
  }
  return results;
}

/**
 * Get the preferred runtime adapter
 */
function getPreferredAdapter() {
  if (preferredRuntime && adapters[preferredRuntime]) {
    return adapters[preferredRuntime];
  }
  // FOSS-first priority: nerdctl > podman > docker
  for (const name of ["nerdctl", "podman", "docker"]) {
    if (connectedAdapters.has(name)) {
      return adapters[name];
    }
  }
  return null;
}

/**
 * Convert adapter param definition to Zod schema
 */
function paramToZod(param) {
  switch (param.type) {
    case "number":
      return z.number().optional().describe(param.description);
    case "boolean":
      return z.boolean().optional().describe(param.description);
    case "string":
    default:
      return z.string().optional().describe(param.description);
  }
}

/**
 * Build Zod schema from adapter tool params
 */
function buildSchema(params) {
  const shape = {};
  for (const [key, param] of Object.entries(params)) {
    shape[key] = paramToZod(param);
  }
  return z.object(shape);
}

/**
 * Format error with feedback URL
 */
function formatError(error, context = {}) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    error: message,
    context,
    feedback: `Report issues: ${FEEDBACK_URL}`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create and configure the MCP server with all tools
 */
function createMcpServer() {
  const server = new McpServer({
    name: "polyglot-container-mcp",
    version: PACKAGE_VERSION,
  });

  // ============================================================================
  // Unified Meta Tools
  // ============================================================================

  server.tool(
    "container_list",
    "List all available container runtimes and their connection status",
    {},
    async () => {
      const runtimes = await detectRuntimes();
      const connected = [];
      const available = [];
      const unavailable = [];

      for (const [name, info] of Object.entries(runtimes)) {
        if (connectedAdapters.has(name)) {
          connected.push({ name, ...info });
        } else if (info.available) {
          available.push({ name, ...info });
        } else {
          unavailable.push({ name, ...info });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                preferredRuntime: preferredRuntime || "auto (FOSS-first)",
                connected,
                available,
                unavailable,
                note: "FOSS runtimes (nerdctl, podman) are preferred over Docker",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "container_detect",
    "Auto-detect and connect to available container runtimes",
    {},
    async () => {
      const results = { connected: [], failed: [], skipped: [] };

      for (const [name, adapter] of Object.entries(adapters)) {
        if (connectedAdapters.has(name)) {
          results.skipped.push({ name, reason: "already connected" });
          continue;
        }

        try {
          await adapter.connect();
          connectedAdapters.set(name, adapter);
          results.connected.push({ name, description: adapter.description });
        } catch (err) {
          results.failed.push({ name, error: err.message });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...results,
                totalConnected: connectedAdapters.size,
                preferredRuntime: preferredRuntime || "auto",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "container_prefer",
    "Set the preferred container runtime for operations",
    {
      runtime: z
        .enum(["nerdctl", "podman", "docker", "auto"])
        .describe("Runtime to prefer (auto uses FOSS-first)"),
    },
    async ({ runtime }) => {
      if (runtime === "auto") {
        preferredRuntime = null;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                message:
                  "Preference cleared. Using FOSS-first auto-detection (nerdctl > podman > docker)",
                current: null,
              }),
            },
          ],
        };
      }

      if (!adapters[runtime]) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(formatError(`Unknown runtime: ${runtime}`)),
            },
          ],
          isError: true,
        };
      }

      preferredRuntime = runtime;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              message: `Preferred runtime set to: ${runtime}`,
              current: runtime,
              note:
                runtime === "docker"
                  ? "Consider using nerdctl or podman for FOSS alternatives"
                  : undefined,
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "container_help",
    "Get help for a specific runtime or list all available tools",
    {
      runtime: z
        .enum(["nerdctl", "podman", "docker", "all"])
        .optional()
        .describe("Runtime to get help for"),
    },
    async ({ runtime }) => {
      const help = {};
      const runtimesToShow =
        runtime && runtime !== "all" ? [runtime] : Object.keys(adapters);

      for (const name of runtimesToShow) {
        const adapter = adapters[name];
        if (!adapter) continue;

        help[name] = {
          description: adapter.description,
          tools: Object.entries(adapter.tools).map(([toolName, tool]) => ({
            name: toolName,
            description: tool.description,
            params: Object.entries(tool.params).map(([pName, pDef]) => ({
              name: pName,
              type: pDef.type,
              description: pDef.description,
            })),
          })),
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...help,
                meta: {
                  version: PACKAGE_VERSION,
                  feedback: FEEDBACK_URL,
                  fossPriority: "nerdctl > podman > docker",
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "container_version",
    "Get version information for polyglot-container-mcp",
    {},
    async () => {
      const versions = { "polyglot-container-mcp": PACKAGE_VERSION };

      for (const [name, adapter] of Object.entries(adapters)) {
        if (connectedAdapters.has(name) && adapter.tools[`${name}_version`]) {
          try {
            const result = await adapter.tools[`${name}_version`].handler({});
            versions[name] = result;
          } catch {
            versions[name] = "connected but version unavailable";
          }
        } else {
          versions[name] = "not connected";
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify(versions, null, 2) }],
      };
    }
  );

  // ============================================================================
  // Register All Adapter Tools
  // ============================================================================

  for (const [adapterName, adapter] of Object.entries(adapters)) {
    for (const [toolName, tool] of Object.entries(adapter.tools)) {
      const schema = buildSchema(tool.params);

      server.tool(toolName, tool.description, schema.shape, async (params) => {
        if (!connectedAdapters.has(adapterName)) {
          try {
            await adapter.connect();
            connectedAdapters.set(adapterName, adapter);
          } catch (err) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    formatError(`${adapterName} not available: ${err.message}`, {
                      tool: toolName,
                      suggestion:
                        adapterName === "docker"
                          ? "Consider using nerdctl or podman instead"
                          : `Ensure ${adapterName} is installed and accessible`,
                    })
                  ),
                },
              ],
              isError: true,
            };
          }
        }

        try {
          const result = await tool.handler(params);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(formatError(err, { tool: toolName, params })),
              },
            ],
            isError: true,
          };
        }
      });
    }
  }

  return server;
}

/**
 * Detect if running in serverless environment
 */
function isServerlessEnvironment() {
  return (
    Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined ||
    Deno.env.get("MCP_HTTP_MODE") === "true" ||
    Deno.args.includes("--http")
  );
}

/**
 * Start the server in STDIO mode (local MCP client)
 */
async function startStdioMode(server) {
  console.error(`polyglot-container-mcp v${PACKAGE_VERSION} (STDIO mode)`);
  console.error("FOSS-first: nerdctl and podman preferred over Docker");

  const runtimes = await detectRuntimes();
  const availableCount = Object.values(runtimes).filter((r) => r.available).length;
  console.error(`Detected ${availableCount} available runtime(s)`);

  for (const [name, adapter] of Object.entries(adapters)) {
    try {
      await adapter.connect();
      connectedAdapters.set(name, adapter);
      console.error(`  ✓ ${name}: ${adapter.description}`);
    } catch {
      console.error(`  ✗ ${name}: not available`);
    }
  }

  if (connectedAdapters.size === 0) {
    console.error("Warning: No container runtimes available!");
    console.error("Install nerdctl, podman, or docker to use this server.");
  }

  const totalTools =
    5 +
    Object.values(adapters).reduce(
      (sum, adapter) => sum + Object.keys(adapter.tools).length,
      0
    );

  console.error(
    `Registered ${totalTools} tools (${connectedAdapters.size} runtime(s) connected)`
  );
  console.error(`Feedback: ${FEEDBACK_URL}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Start the server in HTTP mode (remote/cloud)
 */
async function startHttpMode(server) {
  const port = parseInt(Deno.env.get("PORT") || "8000");
  const host = Deno.env.get("HOST") || "0.0.0.0";

  console.error(`polyglot-container-mcp v${PACKAGE_VERSION} (HTTP mode)`);
  console.error("FOSS-first: nerdctl and podman preferred over Docker");
  console.error(`Listening on http://${host}:${port}/mcp`);
  console.error(`Feedback: ${FEEDBACK_URL}`);

  const transport = new StreamableHttpTransport(null, { path: "/mcp" });

  // Build tools list for HTTP mode
  const allTools = [];

  // Meta tools
  allTools.push(
    { name: "container_list", description: "List all available container runtimes" },
    { name: "container_detect", description: "Auto-detect available runtimes" },
    { name: "container_prefer", description: "Set preferred runtime" },
    { name: "container_help", description: "Get help for a runtime" },
    { name: "container_version", description: "Get version information" }
  );

  // Adapter tools
  for (const [, adapter] of Object.entries(adapters)) {
    for (const [toolName, tool] of Object.entries(adapter.tools)) {
      allTools.push({
        name: toolName,
        description: tool.description,
        inputSchema: {
          type: "object",
          properties: tool.params,
        },
      });
    }
  }

  transport.onMessage(async (message) => {
    if (message.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: {
            tools: { listChanged: true },
          },
          serverInfo: {
            name: "polyglot-container-mcp",
            version: PACKAGE_VERSION,
          },
        },
      };
    }

    if (message.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: { tools: allTools },
      };
    }

    if (message.method === "tools/call") {
      const { name, arguments: args } = message.params;

      // Handle meta tools
      if (name === "container_list") {
        const runtimes = await detectRuntimes();
        return {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            content: [{ type: "text", text: JSON.stringify(runtimes, null, 2) }],
          },
        };
      }

      if (name === "container_version") {
        return {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    name: "polyglot-container-mcp",
                    version: PACKAGE_VERSION,
                    runtimes: Object.keys(adapters),
                  },
                  null,
                  2
                ),
              },
            ],
          },
        };
      }

      // Find adapter tool
      for (const [adapterName, adapter] of Object.entries(adapters)) {
        if (adapter.tools[name]) {
          try {
            if (!connectedAdapters.has(adapterName)) {
              await adapter.connect();
              connectedAdapters.set(adapterName, adapter);
            }
            const result = await adapter.tools[name].handler(args || {});
            return {
              jsonrpc: "2.0",
              id: message.id,
              result: {
                content: [
                  { type: "text", text: JSON.stringify(result, null, 2) },
                ],
              },
            };
          } catch (error) {
            return {
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32603,
                message: error.message,
              },
            };
          }
        }
      }

      return {
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32601,
          message: `Tool not found: ${name}`,
        },
      };
    }

    return {
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32601,
        message: `Method not found: ${message.method}`,
      },
    };
  });

  const handler = async (request) => {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          version: PACKAGE_VERSION,
          runtimes: Object.keys(adapters),
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.pathname === "/" || url.pathname === "/info") {
      return new Response(
        JSON.stringify({
          name: "polyglot-container-mcp",
          version: PACKAGE_VERSION,
          protocol: "MCP Streamable HTTP",
          protocolVersion: "2025-06-18",
          endpoint: "/mcp",
          runtimes: Object.keys(adapters),
          fossPriority: "nerdctl > podman > docker",
          documentation:
            "https://github.com/hyperpolymath/polyglot-container-mcp",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return transport.handleRequest(request);
  };

  Deno.serve({ port, hostname: host }, handler);
}

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

const server = createMcpServer();

if (isServerlessEnvironment()) {
  await startHttpMode(server);
} else {
  await startStdioMode(server);
}
