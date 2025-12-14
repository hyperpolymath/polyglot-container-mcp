// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2025 Jonathan D.A. Jewell

/**
 * Streamable HTTP Transport for MCP
 *
 * Implements the MCP Streamable HTTP transport (June 2025 spec)
 * https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 *
 * Features:
 * - Single endpoint POST/GET handling
 * - Session management with Mcp-Session-Id
 * - SSE streaming responses
 * - Deno Deploy compatible
 */

const PROTOCOL_VERSION = "2025-06-18";

/**
 * Generate a cryptographically secure session ID
 */
function generateSessionId() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

/**
 * Session store for managing MCP sessions
 */
class SessionStore {
  constructor(ttlMs = 30 * 60 * 1000) {
    // 30 min default TTL
    this.sessions = new Map();
    this.ttlMs = ttlMs;
  }

  create() {
    const sessionId = generateSessionId();
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      initialized: false,
      pendingMessages: [],
      eventCounter: 0,
    };
    this.sessions.set(sessionId, session);
    this.cleanup();
    return session;
  }

  get(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccess = Date.now();
    }
    return session;
  }

  delete(sessionId) {
    return this.sessions.delete(sessionId);
  }

  cleanup() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastAccess > this.ttlMs) {
        this.sessions.delete(id);
      }
    }
  }

  nextEventId(session) {
    session.eventCounter++;
    return `${session.id}-${session.eventCounter}`;
  }
}

/**
 * Format a JSON-RPC message as an SSE event
 */
function formatSSEEvent(data, eventId = null) {
  let event = "event: message\n";
  event += `data: ${JSON.stringify(data)}\n`;
  if (eventId) {
    event += `id: ${eventId}\n`;
  }
  event += "\n";
  return event;
}

/**
 * Create an SSE stream response
 */
function createSSEStream() {
  const encoder = new TextEncoder();
  let controller;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  return {
    stream,
    send(data, eventId = null) {
      const event = formatSSEEvent(data, eventId);
      controller.enqueue(encoder.encode(event));
    },
    close() {
      controller.close();
    },
  };
}

/**
 * Streamable HTTP Transport for MCP servers
 */
export class StreamableHttpTransport {
  constructor(server, options = {}) {
    this.server = server;
    this.options = {
      path: options.path || "/mcp",
      allowedOrigins: options.allowedOrigins || null, // null = check Origin but allow all
      enableCors: options.enableCors ?? true,
      sessionTtlMs: options.sessionTtlMs || 30 * 60 * 1000,
      ...options,
    };
    this.sessions = new SessionStore(this.options.sessionTtlMs);
    this.messageHandlers = new Map();
  }

  /**
   * Set the message handler for incoming JSON-RPC messages
   */
  onMessage(handler) {
    this.messageHandler = handler;
  }

  /**
   * Set the close handler
   */
  onClose(handler) {
    this.closeHandler = handler;
  }

  /**
   * Handle incoming HTTP request
   */
  async handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Check if request is for the MCP endpoint
    if (path !== this.options.path) {
      return new Response("Not Found", { status: 404 });
    }

    // Security: Check Origin header
    const origin = request.headers.get("Origin");
    if (origin && this.options.allowedOrigins) {
      if (!this.options.allowedOrigins.includes(origin)) {
        return new Response("Forbidden: Invalid Origin", { status: 403 });
      }
    }

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return this.corsResponse(request, 204);
    }

    // Route by method
    switch (request.method) {
      case "POST":
        return this.handlePost(request);
      case "GET":
        return this.handleGet(request);
      case "DELETE":
        return this.handleDelete(request);
      default:
        return new Response("Method Not Allowed", { status: 405 });
    }
  }

  /**
   * Handle POST - Client sending messages
   */
  async handlePost(request) {
    const sessionId = request.headers.get("Mcp-Session-Id");
    const accept = request.headers.get("Accept") || "";
    const wantsSSE = accept.includes("text/event-stream");

    let body;
    try {
      body = await request.json();
    } catch {
      return this.jsonResponse({ error: "Invalid JSON" }, 400);
    }

    // Check if this is an initialize request
    const isInitialize =
      body.method === "initialize" ||
      (Array.isArray(body) && body.some((m) => m.method === "initialize"));

    let session;
    if (isInitialize) {
      // Create new session for initialize
      session = this.sessions.create();
    } else {
      // Require existing session for other requests
      if (!sessionId) {
        return this.jsonResponse(
          { error: "Missing Mcp-Session-Id header" },
          400
        );
      }
      session = this.sessions.get(sessionId);
      if (!session) {
        return this.jsonResponse({ error: "Session not found" }, 404);
      }
    }

    // Process the message(s)
    const messages = Array.isArray(body) ? body : [body];
    const responses = [];

    for (const message of messages) {
      if (this.messageHandler) {
        try {
          const response = await this.messageHandler(message);
          if (response !== undefined) {
            responses.push(response);
          }
        } catch (error) {
          responses.push({
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code: -32603,
              message: error.message,
            },
          });
        }
      }
    }

    // Determine response format
    if (responses.length === 0) {
      // No response needed (notification)
      return this.acceptedResponse(session.id);
    }

    if (wantsSSE && responses.length > 1) {
      // Return as SSE stream
      return this.sseResponse(session, responses);
    }

    // Return as JSON
    const result = responses.length === 1 ? responses[0] : responses;
    return this.jsonResponse(result, 200, session.id);
  }

  /**
   * Handle GET - Server-to-client SSE stream
   */
  async handleGet(request) {
    const sessionId = request.headers.get("Mcp-Session-Id");
    const lastEventId = request.headers.get("Last-Event-ID");

    if (!sessionId) {
      return this.jsonResponse({ error: "Missing Mcp-Session-Id header" }, 400);
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return this.jsonResponse({ error: "Session not found" }, 404);
    }

    // Create SSE stream for server-initiated messages
    const sse = createSSEStream();

    // Send any pending messages
    for (const msg of session.pendingMessages) {
      sse.send(msg, this.sessions.nextEventId(session));
    }
    session.pendingMessages = [];

    // Keep stream open for future messages
    // In Deno Deploy, we need to close eventually
    // For now, close after sending pending messages
    sse.close();

    return this.corsResponse(
      request,
      200,
      {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Mcp-Session-Id": session.id,
        "MCP-Protocol-Version": PROTOCOL_VERSION,
      },
      sse.stream
    );
  }

  /**
   * Handle DELETE - Session termination
   */
  async handleDelete(request) {
    const sessionId = request.headers.get("Mcp-Session-Id");

    if (!sessionId) {
      return this.jsonResponse({ error: "Missing Mcp-Session-Id header" }, 400);
    }

    const deleted = this.sessions.delete(sessionId);
    if (!deleted) {
      return this.jsonResponse({ error: "Session not found" }, 404);
    }

    if (this.closeHandler) {
      this.closeHandler();
    }

    return new Response(null, { status: 204 });
  }

  /**
   * Send a server-initiated message to a session
   */
  sendToSession(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pendingMessages.push(message);
    }
  }

  /**
   * Create JSON response with appropriate headers
   */
  jsonResponse(data, status = 200, sessionId = null) {
    const headers = {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
    };
    if (sessionId) {
      headers["Mcp-Session-Id"] = sessionId;
    }
    if (this.options.enableCors) {
      headers["Access-Control-Allow-Origin"] = "*";
      headers["Access-Control-Allow-Headers"] =
        "Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Accept";
      headers["Access-Control-Expose-Headers"] =
        "Mcp-Session-Id, MCP-Protocol-Version";
    }
    return new Response(JSON.stringify(data), { status, headers });
  }

  /**
   * Create 202 Accepted response
   */
  acceptedResponse(sessionId) {
    const headers = {
      "MCP-Protocol-Version": PROTOCOL_VERSION,
    };
    if (sessionId) {
      headers["Mcp-Session-Id"] = sessionId;
    }
    if (this.options.enableCors) {
      headers["Access-Control-Allow-Origin"] = "*";
    }
    return new Response(null, { status: 202, headers });
  }

  /**
   * Create SSE stream response
   */
  sseResponse(session, messages) {
    const sse = createSSEStream();

    for (const msg of messages) {
      sse.send(msg, this.sessions.nextEventId(session));
    }
    sse.close();

    const headers = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Mcp-Session-Id": session.id,
      "MCP-Protocol-Version": PROTOCOL_VERSION,
    };
    if (this.options.enableCors) {
      headers["Access-Control-Allow-Origin"] = "*";
      headers["Access-Control-Expose-Headers"] =
        "Mcp-Session-Id, MCP-Protocol-Version";
    }

    return new Response(sse.stream, { status: 200, headers });
  }

  /**
   * Create CORS response
   */
  corsResponse(request, status = 200, headers = {}, body = null) {
    const responseHeaders = {
      ...headers,
    };
    if (this.options.enableCors) {
      responseHeaders["Access-Control-Allow-Origin"] =
        request.headers.get("Origin") || "*";
      responseHeaders["Access-Control-Allow-Methods"] =
        "GET, POST, DELETE, OPTIONS";
      responseHeaders["Access-Control-Allow-Headers"] =
        "Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Accept, Last-Event-ID";
      responseHeaders["Access-Control-Expose-Headers"] =
        "Mcp-Session-Id, MCP-Protocol-Version";
      responseHeaders["Access-Control-Max-Age"] = "86400";
    }
    return new Response(body, { status, headers: responseHeaders });
  }
}

/**
 * Create a Deno.serve handler for the MCP server
 */
export function createHttpHandler(mcpServer, options = {}) {
  const transport = new StreamableHttpTransport(mcpServer, options);

  // Bridge between transport and MCP server
  transport.onMessage(async (message) => {
    // The MCP SDK server handles the message internally
    // We need to invoke the server's request handler
    return await mcpServer._handleRequest(message);
  });

  return async (request) => {
    return transport.handleRequest(request);
  };
}

/**
 * Adapter to make MCP SDK server work with Streamable HTTP
 */
export class McpHttpAdapter {
  constructor(mcpServer) {
    this.server = mcpServer;
    this.transport = new StreamableHttpTransport(this, {});
    this.requestHandlers = new Map();
    this.notificationHandlers = new Map();
  }

  /**
   * Register a request handler (mirrors MCP SDK pattern)
   */
  setRequestHandler(schema, handler) {
    this.requestHandlers.set(schema.method, { schema, handler });
  }

  /**
   * Register a notification handler
   */
  setNotificationHandler(schema, handler) {
    this.notificationHandlers.set(schema.method, { schema, handler });
  }

  /**
   * Handle incoming JSON-RPC message
   */
  async handleMessage(message) {
    if (message.method) {
      // Request or notification
      const handler =
        this.requestHandlers.get(message.method) ||
        this.notificationHandlers.get(message.method);

      if (handler) {
        try {
          const result = await handler.handler(message.params || {});
          if (message.id !== undefined) {
            return {
              jsonrpc: "2.0",
              id: message.id,
              result,
            };
          }
          return undefined; // Notification - no response
        } catch (error) {
          if (message.id !== undefined) {
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
      } else {
        if (message.id !== undefined) {
          return {
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code: -32601,
              message: `Method not found: ${message.method}`,
            },
          };
        }
      }
    }
    return undefined;
  }

  /**
   * Create HTTP request handler for Deno.serve
   */
  createHandler() {
    this.transport.onMessage((msg) => this.handleMessage(msg));
    return (request) => this.transport.handleRequest(request);
  }
}

export default { StreamableHttpTransport, createHttpHandler, McpHttpAdapter };
