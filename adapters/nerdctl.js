// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2025 Jonathan D.A. Jewell

/**
 * nerdctl Adapter
 * containerd's Docker-compatible CLI - FOSS preferred runtime
 *
 * nerdctl provides a Docker-compatible interface to containerd,
 * supporting rootless containers, lazy-pulling, and encryption.
 */

const NERDCTL_PATH = Deno.env.get("NERDCTL_PATH") || "nerdctl";
const NERDCTL_NAMESPACE = Deno.env.get("NERDCTL_NAMESPACE") || "default";
const NERDCTL_HOST = Deno.env.get("NERDCTL_HOST") || "";
const NERDCTL_SNAPSHOTTER = Deno.env.get("NERDCTL_SNAPSHOTTER") || "";

// Allowed subcommands (whitelist)
const ALLOWED_COMMANDS = [
  "run", "create", "start", "stop", "restart", "kill", "rm", "pause", "unpause",
  "ps", "inspect", "logs", "top", "stats", "port", "diff", "exec", "attach", "cp",
  "export", "images", "pull", "push", "build", "tag", "rmi", "save", "load",
  "image", "history", "network", "volume", "compose", "info", "version", "system",
  "events", "login", "logout"
];

// Sanitize argument to prevent injection
function sanitizeArg(arg) {
  if (typeof arg !== "string") return String(arg);
  return arg.replace(/[;&|`$(){}[\]<>]/g, "").trim();
}

// Execute nerdctl command safely
async function exec(subcommand, args = []) {
  if (!ALLOWED_COMMANDS.includes(subcommand)) {
    throw new Error(`Command not allowed: ${subcommand}`);
  }

  const baseArgs = [];

  // Add namespace if specified
  if (NERDCTL_NAMESPACE && NERDCTL_NAMESPACE !== "default") {
    baseArgs.push("--namespace", NERDCTL_NAMESPACE);
  }

  // Add host if specified
  if (NERDCTL_HOST) {
    baseArgs.push("--host", NERDCTL_HOST);
  }

  // Add snapshotter if specified
  if (NERDCTL_SNAPSHOTTER) {
    baseArgs.push("--snapshotter", NERDCTL_SNAPSHOTTER);
  }

  const fullArgs = [...baseArgs, subcommand, ...args.map(sanitizeArg)];

  const cmd = new Deno.Command(NERDCTL_PATH, {
    args: fullArgs,
    stdout: "piped",
    stderr: "piped",
  });

  const output = await cmd.output();
  const decoder = new TextDecoder();

  return {
    stdout: decoder.decode(output.stdout),
    stderr: decoder.decode(output.stderr),
    code: output.code,
  };
}

// Execute with JSON output
async function execJson(subcommand, args = []) {
  const jsonArgs = ["--format", "json", ...args];
  return exec(subcommand, jsonArgs);
}

// Parse JSON output safely
function parseJsonOutput(stdout) {
  try {
    // Handle NDJSON (newline-delimited JSON)
    const lines = stdout.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return [];
    if (lines.length === 1) {
      return JSON.parse(lines[0]);
    }
    return lines.map((line) => JSON.parse(line));
  } catch {
    return { raw: stdout };
  }
}

// ============================================================================
// Adapter Interface
// ============================================================================

export const name = "nerdctl";
export const description = "nerdctl - containerd CLI (FOSS preferred)";

export async function connect() {
  // nerdctl doesn't require explicit connection
  // but we verify it's available
  const result = await exec("version");
  if (result.code !== 0) {
    throw new Error(`nerdctl not available: ${result.stderr}`);
  }
}

export async function disconnect() {
  // No cleanup needed for CLI-based adapter
}

export async function isConnected() {
  try {
    const result = await exec("version");
    return result.code === 0;
  } catch {
    return false;
  }
}

// ============================================================================
// Tools
// ============================================================================

export const tools = {
  // ==========================================================================
  // Container Lifecycle
  // ==========================================================================

  nerdctl_run: {
    description: "Run a new container",
    params: {
      image: { type: "string", description: "Container image to run" },
      name: { type: "string", description: "Container name (optional)" },
      detach: { type: "boolean", description: "Run in background (default: true)" },
      ports: { type: "string", description: "Port mappings, e.g., '8080:80,443:443'" },
      env: { type: "string", description: "Environment variables as JSON object" },
      volumes: { type: "string", description: "Volume mounts, e.g., '/host:/container'" },
      network: { type: "string", description: "Network to connect to" },
      command: { type: "string", description: "Command to run in container" },
      privileged: { type: "boolean", description: "Run in privileged mode (for nested containers)" },
      securityOpt: { type: "string", description: "Security options, comma-separated" },
      cgroupns: { type: "string", description: "Cgroup namespace mode (host, private)" },
      nested: { type: "boolean", description: "Setup for nested containers (mounts containerd socket)" },
    },
    handler: async ({ image, name, detach = true, ports, env, volumes, network, command, privileged, securityOpt, cgroupns, nested }) => {
      const args = [];

      if (detach) args.push("-d");
      if (name) args.push("--name", name);
      if (network) args.push("--network", network);
      if (privileged) args.push("--privileged");
      if (cgroupns) args.push("--cgroupns", cgroupns);

      // Nested container setup - mount containerd socket
      if (nested) {
        args.push("-v", "/run/containerd/containerd.sock:/run/containerd/containerd.sock");
        args.push("-v", "/var/lib/containerd:/var/lib/containerd");
        if (!privileged) args.push("--privileged"); // nested typically requires privileged
      }

      if (securityOpt) {
        securityOpt.split(",").forEach((opt) => args.push("--security-opt", opt.trim()));
      }

      if (ports) {
        ports.split(",").forEach((p) => args.push("-p", p.trim()));
      }

      if (env) {
        try {
          const envObj = JSON.parse(env);
          Object.entries(envObj).forEach(([k, v]) => args.push("-e", `${k}=${v}`));
        } catch {
          args.push("-e", env);
        }
      }

      if (volumes) {
        volumes.split(",").forEach((v) => args.push("-v", v.trim()));
      }

      args.push(image);

      if (command) {
        args.push(...command.split(" "));
      }

      const result = await exec("run", args);
      return {
        containerId: result.stdout.trim(),
        success: result.code === 0,
        nested: nested || false,
        privileged: privileged || nested || false,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_ps: {
    description: "List containers",
    params: {
      all: { type: "boolean", description: "Show all containers (default: running only)" },
      quiet: { type: "boolean", description: "Only show container IDs" },
    },
    handler: async ({ all = false, quiet = false }) => {
      const args = ["--format", "json"];
      if (all) args.push("-a");
      if (quiet) args.push("-q");

      const result = await exec("ps", args);
      if (result.code !== 0) {
        throw new Error(result.stderr);
      }

      return {
        containers: parseJsonOutput(result.stdout),
      };
    },
  },

  nerdctl_stop: {
    description: "Stop one or more containers",
    params: {
      containers: { type: "string", description: "Container ID(s) or name(s), comma-separated" },
      time: { type: "number", description: "Seconds to wait before killing (default: 10)" },
    },
    handler: async ({ containers, time }) => {
      const args = [];
      if (time) args.push("-t", String(time));
      args.push(...containers.split(",").map((c) => c.trim()));

      const result = await exec("stop", args);
      return {
        stopped: containers.split(",").map((c) => c.trim()),
        success: result.code === 0,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_start: {
    description: "Start one or more stopped containers",
    params: {
      containers: { type: "string", description: "Container ID(s) or name(s), comma-separated" },
    },
    handler: async ({ containers }) => {
      const args = containers.split(",").map((c) => c.trim());
      const result = await exec("start", args);
      return {
        started: args,
        success: result.code === 0,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_restart: {
    description: "Restart one or more containers",
    params: {
      containers: { type: "string", description: "Container ID(s) or name(s), comma-separated" },
      time: { type: "number", description: "Seconds to wait before killing (default: 10)" },
    },
    handler: async ({ containers, time }) => {
      const args = [];
      if (time) args.push("-t", String(time));
      args.push(...containers.split(",").map((c) => c.trim()));

      const result = await exec("restart", args);
      return {
        restarted: containers.split(",").map((c) => c.trim()),
        success: result.code === 0,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_rm: {
    description: "Remove one or more containers",
    params: {
      containers: { type: "string", description: "Container ID(s) or name(s), comma-separated" },
      force: { type: "boolean", description: "Force removal of running container" },
      volumes: { type: "boolean", description: "Remove associated volumes" },
    },
    handler: async ({ containers, force = false, volumes = false }) => {
      const args = [];
      if (force) args.push("-f");
      if (volumes) args.push("-v");
      args.push(...containers.split(",").map((c) => c.trim()));

      const result = await exec("rm", args);
      return {
        removed: containers.split(",").map((c) => c.trim()),
        success: result.code === 0,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_logs: {
    description: "Fetch logs of a container",
    params: {
      container: { type: "string", description: "Container ID or name" },
      tail: { type: "number", description: "Number of lines to show from end" },
      follow: { type: "boolean", description: "Follow log output (not recommended for MCP)" },
      timestamps: { type: "boolean", description: "Show timestamps" },
    },
    handler: async ({ container, tail, follow = false, timestamps = false }) => {
      const args = [];
      if (tail) args.push("--tail", String(tail));
      if (timestamps) args.push("-t");
      // Note: follow is not recommended for MCP as it blocks
      args.push(container);

      const result = await exec("logs", args);
      return {
        logs: result.stdout,
        success: result.code === 0,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_exec: {
    description: "Execute a command in a running container",
    params: {
      container: { type: "string", description: "Container ID or name" },
      command: { type: "string", description: "Command to execute" },
      interactive: { type: "boolean", description: "Keep STDIN open" },
      tty: { type: "boolean", description: "Allocate pseudo-TTY" },
      user: { type: "string", description: "Username or UID" },
      workdir: { type: "string", description: "Working directory inside container" },
    },
    handler: async ({ container, command, interactive = false, tty = false, user, workdir }) => {
      const args = [];
      if (interactive) args.push("-i");
      if (tty) args.push("-t");
      if (user) args.push("-u", user);
      if (workdir) args.push("-w", workdir);
      args.push(container);
      args.push(...command.split(" "));

      const result = await exec("exec", args);
      return {
        output: result.stdout,
        success: result.code === 0,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_inspect: {
    description: "Return low-level information on containers or images",
    params: {
      target: { type: "string", description: "Container or image ID/name" },
    },
    handler: async ({ target }) => {
      const result = await exec("inspect", [target]);
      if (result.code !== 0) {
        throw new Error(result.stderr);
      }
      return parseJsonOutput(result.stdout);
    },
  },

  nerdctl_cp: {
    description: "Copy files between container and local filesystem",
    params: {
      source: { type: "string", description: "Source path (container:path or local path)" },
      destination: { type: "string", description: "Destination path (container:path or local path)" },
    },
    handler: async ({ source, destination }) => {
      const result = await exec("cp", [source, destination]);
      return {
        success: result.code === 0,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  // ==========================================================================
  // Image Management
  // ==========================================================================

  nerdctl_images: {
    description: "List images",
    params: {
      all: { type: "boolean", description: "Show all images (including intermediate)" },
    },
    handler: async ({ all = false }) => {
      const args = ["--format", "json"];
      if (all) args.push("-a");

      const result = await exec("images", args);
      if (result.code !== 0) {
        throw new Error(result.stderr);
      }

      return {
        images: parseJsonOutput(result.stdout),
      };
    },
  },

  nerdctl_pull: {
    description: "Pull an image from a registry",
    params: {
      image: { type: "string", description: "Image name (e.g., nginx:latest)" },
      platform: { type: "string", description: "Platform (e.g., linux/amd64)" },
    },
    handler: async ({ image, platform }) => {
      const args = [];
      if (platform) args.push("--platform", platform);
      args.push(image);

      const result = await exec("pull", args);
      return {
        image,
        success: result.code === 0,
        output: result.stdout,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_push: {
    description: "Push an image to a registry",
    params: {
      image: { type: "string", description: "Image name with tag" },
    },
    handler: async ({ image }) => {
      const result = await exec("push", [image]);
      return {
        image,
        success: result.code === 0,
        output: result.stdout,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_build: {
    description: "Build an image from a Containerfile/Dockerfile",
    params: {
      context: { type: "string", description: "Build context path (default: .)" },
      file: { type: "string", description: "Path to Containerfile/Dockerfile" },
      tag: { type: "string", description: "Image tag (e.g., myimage:latest)" },
      buildArgs: { type: "string", description: "Build arguments as JSON object" },
      noCache: { type: "boolean", description: "Do not use cache" },
    },
    handler: async ({ context = ".", file, tag, buildArgs, noCache = false }) => {
      const args = [];
      if (file) args.push("-f", file);
      if (tag) args.push("-t", tag);
      if (noCache) args.push("--no-cache");

      if (buildArgs) {
        try {
          const argsObj = JSON.parse(buildArgs);
          Object.entries(argsObj).forEach(([k, v]) => args.push("--build-arg", `${k}=${v}`));
        } catch {
          // ignore
        }
      }

      args.push(context);

      const result = await exec("build", args);
      return {
        tag,
        success: result.code === 0,
        output: result.stdout,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_tag: {
    description: "Create a tag for an image",
    params: {
      source: { type: "string", description: "Source image" },
      target: { type: "string", description: "Target image with tag" },
    },
    handler: async ({ source, target }) => {
      const result = await exec("tag", [source, target]);
      return {
        success: result.code === 0,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_rmi: {
    description: "Remove one or more images",
    params: {
      images: { type: "string", description: "Image ID(s) or name(s), comma-separated" },
      force: { type: "boolean", description: "Force removal" },
    },
    handler: async ({ images, force = false }) => {
      const args = [];
      if (force) args.push("-f");
      args.push(...images.split(",").map((i) => i.trim()));

      const result = await exec("rmi", args);
      return {
        removed: images.split(",").map((i) => i.trim()),
        success: result.code === 0,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_save: {
    description: "Save image(s) to a tar archive",
    params: {
      images: { type: "string", description: "Image(s) to save, comma-separated" },
      output: { type: "string", description: "Output file path" },
    },
    handler: async ({ images, output }) => {
      const args = ["-o", output, ...images.split(",").map((i) => i.trim())];
      const result = await exec("save", args);
      return {
        output,
        success: result.code === 0,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_load: {
    description: "Load image(s) from a tar archive",
    params: {
      input: { type: "string", description: "Input file path" },
    },
    handler: async ({ input }) => {
      const result = await exec("load", ["-i", input]);
      return {
        success: result.code === 0,
        output: result.stdout,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  // ==========================================================================
  // Network Management
  // ==========================================================================

  nerdctl_network_ls: {
    description: "List networks",
    params: {},
    handler: async () => {
      const result = await exec("network", ["ls", "--format", "json"]);
      if (result.code !== 0) {
        throw new Error(result.stderr);
      }
      return {
        networks: parseJsonOutput(result.stdout),
      };
    },
  },

  nerdctl_network_create: {
    description: "Create a network",
    params: {
      name: { type: "string", description: "Network name" },
      driver: { type: "string", description: "Network driver (bridge, host, none)" },
      subnet: { type: "string", description: "Subnet in CIDR format" },
    },
    handler: async ({ name, driver, subnet }) => {
      const args = [];
      if (driver) args.push("-d", driver);
      if (subnet) args.push("--subnet", subnet);
      args.push(name);

      const result = await exec("network", ["create", ...args]);
      return {
        name,
        success: result.code === 0,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_network_rm: {
    description: "Remove one or more networks",
    params: {
      networks: { type: "string", description: "Network name(s), comma-separated" },
    },
    handler: async ({ networks }) => {
      const args = networks.split(",").map((n) => n.trim());
      const result = await exec("network", ["rm", ...args]);
      return {
        removed: args,
        success: result.code === 0,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_network_inspect: {
    description: "Display detailed information on networks",
    params: {
      network: { type: "string", description: "Network name or ID" },
    },
    handler: async ({ network }) => {
      const result = await exec("network", ["inspect", network]);
      if (result.code !== 0) {
        throw new Error(result.stderr);
      }
      return parseJsonOutput(result.stdout);
    },
  },

  // ==========================================================================
  // Volume Management
  // ==========================================================================

  nerdctl_volume_ls: {
    description: "List volumes",
    params: {},
    handler: async () => {
      const result = await exec("volume", ["ls", "--format", "json"]);
      if (result.code !== 0) {
        throw new Error(result.stderr);
      }
      return {
        volumes: parseJsonOutput(result.stdout),
      };
    },
  },

  nerdctl_volume_create: {
    description: "Create a volume",
    params: {
      name: { type: "string", description: "Volume name" },
    },
    handler: async ({ name }) => {
      const result = await exec("volume", ["create", name]);
      return {
        name,
        success: result.code === 0,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_volume_rm: {
    description: "Remove one or more volumes",
    params: {
      volumes: { type: "string", description: "Volume name(s), comma-separated" },
      force: { type: "boolean", description: "Force removal" },
    },
    handler: async ({ volumes, force = false }) => {
      const args = [];
      if (force) args.push("-f");
      args.push(...volumes.split(",").map((v) => v.trim()));

      const result = await exec("volume", ["rm", ...args]);
      return {
        removed: volumes.split(",").map((v) => v.trim()),
        success: result.code === 0,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_volume_inspect: {
    description: "Display detailed information on volumes",
    params: {
      volume: { type: "string", description: "Volume name" },
    },
    handler: async ({ volume }) => {
      const result = await exec("volume", ["inspect", volume]);
      if (result.code !== 0) {
        throw new Error(result.stderr);
      }
      return parseJsonOutput(result.stdout);
    },
  },

  // ==========================================================================
  // Compose
  // ==========================================================================

  nerdctl_compose_up: {
    description: "Create and start containers defined in compose file",
    params: {
      file: { type: "string", description: "Compose file path (default: compose.yaml)" },
      detach: { type: "boolean", description: "Run in background (default: true)" },
      build: { type: "boolean", description: "Build images before starting" },
    },
    handler: async ({ file, detach = true, build = false }) => {
      const args = [];
      if (file) args.push("-f", file);
      args.push("up");
      if (detach) args.push("-d");
      if (build) args.push("--build");

      const result = await exec("compose", args);
      return {
        success: result.code === 0,
        output: result.stdout,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_compose_down: {
    description: "Stop and remove containers defined in compose file",
    params: {
      file: { type: "string", description: "Compose file path" },
      volumes: { type: "boolean", description: "Remove volumes" },
      removeOrphans: { type: "boolean", description: "Remove orphan containers" },
    },
    handler: async ({ file, volumes = false, removeOrphans = false }) => {
      const args = [];
      if (file) args.push("-f", file);
      args.push("down");
      if (volumes) args.push("-v");
      if (removeOrphans) args.push("--remove-orphans");

      const result = await exec("compose", args);
      return {
        success: result.code === 0,
        output: result.stdout,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  nerdctl_compose_ps: {
    description: "List compose services",
    params: {
      file: { type: "string", description: "Compose file path" },
    },
    handler: async ({ file }) => {
      const args = [];
      if (file) args.push("-f", file);
      args.push("ps", "--format", "json");

      const result = await exec("compose", args);
      if (result.code !== 0) {
        throw new Error(result.stderr);
      }
      return {
        services: parseJsonOutput(result.stdout),
      };
    },
  },

  nerdctl_compose_logs: {
    description: "View compose service logs",
    params: {
      file: { type: "string", description: "Compose file path" },
      service: { type: "string", description: "Service name (optional, all if omitted)" },
      tail: { type: "number", description: "Number of lines from end" },
    },
    handler: async ({ file, service, tail }) => {
      const args = [];
      if (file) args.push("-f", file);
      args.push("logs");
      if (tail) args.push("--tail", String(tail));
      if (service) args.push(service);

      const result = await exec("compose", args);
      return {
        logs: result.stdout,
        success: result.code === 0,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  // ==========================================================================
  // System
  // ==========================================================================

  nerdctl_info: {
    description: "Display system-wide information",
    params: {},
    handler: async () => {
      const result = await exec("info", ["--format", "json"]);
      if (result.code !== 0) {
        throw new Error(result.stderr);
      }
      return parseJsonOutput(result.stdout);
    },
  },

  nerdctl_version: {
    description: "Show nerdctl version information",
    params: {},
    handler: async () => {
      const result = await exec("version", ["--format", "json"]);
      if (result.code !== 0) {
        // Fallback to text output
        const textResult = await exec("version", []);
        return { version: textResult.stdout };
      }
      return parseJsonOutput(result.stdout);
    },
  },

  nerdctl_stats: {
    description: "Display container resource usage statistics",
    params: {
      containers: { type: "string", description: "Container(s) to show stats for (optional)" },
      noStream: { type: "boolean", description: "Disable streaming (default: true for MCP)" },
    },
    handler: async ({ containers, noStream = true }) => {
      const args = ["--format", "json"];
      if (noStream) args.push("--no-stream");
      if (containers) {
        args.push(...containers.split(",").map((c) => c.trim()));
      }

      const result = await exec("stats", args);
      if (result.code !== 0) {
        throw new Error(result.stderr);
      }
      return {
        stats: parseJsonOutput(result.stdout),
      };
    },
  },

  nerdctl_system_prune: {
    description: "Remove unused containers, networks, images",
    params: {
      all: { type: "boolean", description: "Remove all unused images, not just dangling" },
      volumes: { type: "boolean", description: "Also prune volumes" },
      force: { type: "boolean", description: "Do not prompt for confirmation" },
    },
    handler: async ({ all = false, volumes = false, force = true }) => {
      const args = [];
      if (all) args.push("-a");
      if (volumes) args.push("--volumes");
      if (force) args.push("-f");

      const result = await exec("system", ["prune", ...args]);
      return {
        success: result.code === 0,
        output: result.stdout,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },
};
