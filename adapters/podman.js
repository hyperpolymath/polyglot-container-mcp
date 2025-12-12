// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2025 Jonathan D.A. Jewell

/**
 * podman Adapter
 * Red Hat's daemonless container engine - FOSS preferred runtime
 *
 * Podman is rootless-first, daemonless, and fully OCI-compliant.
 * Drop-in replacement for Docker with better security model.
 */

const PODMAN_PATH = Deno.env.get("PODMAN_PATH") || "podman";
const PODMAN_HOST = Deno.env.get("PODMAN_HOST") || "";

// Allowed subcommands (whitelist)
const ALLOWED_COMMANDS = [
  "run", "create", "start", "stop", "restart", "kill", "rm", "pause", "unpause",
  "ps", "inspect", "logs", "top", "stats", "port", "diff", "exec", "attach", "cp",
  "export", "images", "pull", "push", "build", "tag", "rmi", "save", "load",
  "image", "history", "network", "volume", "compose", "info", "version", "system",
  "events", "login", "logout", "pod"
];

// Sanitize argument to prevent injection
function sanitizeArg(arg) {
  if (typeof arg !== "string") return String(arg);
  return arg.replace(/[;&|`$(){}[\]<>]/g, "").trim();
}

// Execute podman command safely
async function exec(subcommand, args = []) {
  if (!ALLOWED_COMMANDS.includes(subcommand)) {
    throw new Error(`Command not allowed: ${subcommand}`);
  }

  const baseArgs = [];
  if (PODMAN_HOST) {
    baseArgs.push("--url", PODMAN_HOST);
  }

  const fullArgs = [...baseArgs, subcommand, ...args.map(sanitizeArg)];

  const cmd = new Deno.Command(PODMAN_PATH, {
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

// Parse JSON output safely
function parseJsonOutput(stdout) {
  try {
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

export const name = "podman";
export const description = "Podman - Daemonless container engine (FOSS preferred)";

export async function connect() {
  const result = await exec("version");
  if (result.code !== 0) {
    throw new Error(`Podman not available: ${result.stderr}`);
  }
}

export async function disconnect() {}

export async function isConnected() {
  try {
    const result = await exec("version");
    return result.code === 0;
  } catch {
    return false;
  }
}

// ============================================================================
// Tools (same structure as nerdctl, prefixed with podman_)
// ============================================================================

export const tools = {
  // Container Lifecycle
  podman_run: {
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
      nested: { type: "boolean", description: "Setup for podman-in-podman (mounts podman socket)" },
      userns: { type: "string", description: "User namespace mode (keep-id for rootless)" },
    },
    handler: async ({ image, name, detach = true, ports, env, volumes, network, command, privileged, securityOpt, cgroupns, nested, userns }) => {
      const args = [];
      if (detach) args.push("-d");
      if (name) args.push("--name", name);
      if (network) args.push("--network", network);
      if (privileged) args.push("--privileged");
      if (cgroupns) args.push("--cgroupns", cgroupns);
      if (userns) args.push("--userns", userns);

      // Nested container setup - podman-in-podman
      if (nested) {
        // For rootless podman-in-podman
        const uid = Deno.env.get("UID") || "1000";
        args.push("-v", `/run/user/${uid}/podman/podman.sock:/run/user/${uid}/podman/podman.sock`);
        args.push("-e", `CONTAINER_HOST=unix:///run/user/${uid}/podman/podman.sock`);
        args.push("--security-opt", "label=disable");
        if (!privileged && !userns) args.push("--userns", "keep-id");
      }

      if (securityOpt) {
        securityOpt.split(",").forEach((opt) => args.push("--security-opt", opt.trim()));
      }

      if (ports) ports.split(",").forEach((p) => args.push("-p", p.trim()));
      if (env) {
        try {
          const envObj = JSON.parse(env);
          Object.entries(envObj).forEach(([k, v]) => args.push("-e", `${k}=${v}`));
        } catch { args.push("-e", env); }
      }
      if (volumes) volumes.split(",").forEach((v) => args.push("-v", v.trim()));
      args.push(image);
      if (command) args.push(...command.split(" "));

      const result = await exec("run", args);
      return {
        containerId: result.stdout.trim(),
        success: result.code === 0,
        nested: nested || false,
        privileged: privileged || false,
        error: result.code !== 0 ? result.stderr : undefined,
      };
    },
  },

  podman_ps: {
    description: "List containers",
    params: {
      all: { type: "boolean", description: "Show all containers" },
    },
    handler: async ({ all = false }) => {
      const args = ["--format", "json"];
      if (all) args.push("-a");
      const result = await exec("ps", args);
      return { containers: parseJsonOutput(result.stdout) };
    },
  },

  podman_stop: {
    description: "Stop containers",
    params: { containers: { type: "string", description: "Container ID(s), comma-separated" } },
    handler: async ({ containers }) => {
      const result = await exec("stop", containers.split(",").map((c) => c.trim()));
      return { stopped: containers.split(","), success: result.code === 0, error: result.code !== 0 ? result.stderr : undefined };
    },
  },

  podman_start: {
    description: "Start containers",
    params: { containers: { type: "string", description: "Container ID(s), comma-separated" } },
    handler: async ({ containers }) => {
      const result = await exec("start", containers.split(",").map((c) => c.trim()));
      return { started: containers.split(","), success: result.code === 0, error: result.code !== 0 ? result.stderr : undefined };
    },
  },

  podman_restart: {
    description: "Restart containers",
    params: { containers: { type: "string", description: "Container ID(s), comma-separated" } },
    handler: async ({ containers }) => {
      const result = await exec("restart", containers.split(",").map((c) => c.trim()));
      return { restarted: containers.split(","), success: result.code === 0, error: result.code !== 0 ? result.stderr : undefined };
    },
  },

  podman_rm: {
    description: "Remove containers",
    params: {
      containers: { type: "string", description: "Container ID(s), comma-separated" },
      force: { type: "boolean", description: "Force removal" },
    },
    handler: async ({ containers, force = false }) => {
      const args = force ? ["-f"] : [];
      args.push(...containers.split(",").map((c) => c.trim()));
      const result = await exec("rm", args);
      return { removed: containers.split(","), success: result.code === 0, error: result.code !== 0 ? result.stderr : undefined };
    },
  },

  podman_logs: {
    description: "Fetch container logs",
    params: {
      container: { type: "string", description: "Container ID or name" },
      tail: { type: "number", description: "Lines from end" },
    },
    handler: async ({ container, tail }) => {
      const args = tail ? ["--tail", String(tail), container] : [container];
      const result = await exec("logs", args);
      return { logs: result.stdout, success: result.code === 0 };
    },
  },

  podman_exec: {
    description: "Execute command in container",
    params: {
      container: { type: "string", description: "Container ID or name" },
      command: { type: "string", description: "Command to execute" },
    },
    handler: async ({ container, command }) => {
      const result = await exec("exec", [container, ...command.split(" ")]);
      return { output: result.stdout, success: result.code === 0, error: result.code !== 0 ? result.stderr : undefined };
    },
  },

  podman_inspect: {
    description: "Inspect container or image",
    params: { target: { type: "string", description: "Container or image ID/name" } },
    handler: async ({ target }) => {
      const result = await exec("inspect", [target]);
      return parseJsonOutput(result.stdout);
    },
  },

  podman_cp: {
    description: "Copy files to/from container",
    params: {
      source: { type: "string", description: "Source path" },
      destination: { type: "string", description: "Destination path" },
    },
    handler: async ({ source, destination }) => {
      const result = await exec("cp", [source, destination]);
      return { success: result.code === 0, error: result.code !== 0 ? result.stderr : undefined };
    },
  },

  // Image Management
  podman_images: {
    description: "List images",
    params: {},
    handler: async () => {
      const result = await exec("images", ["--format", "json"]);
      return { images: parseJsonOutput(result.stdout) };
    },
  },

  podman_pull: {
    description: "Pull an image",
    params: { image: { type: "string", description: "Image name" } },
    handler: async ({ image }) => {
      const result = await exec("pull", [image]);
      return { image, success: result.code === 0, error: result.code !== 0 ? result.stderr : undefined };
    },
  },

  podman_push: {
    description: "Push an image",
    params: { image: { type: "string", description: "Image name" } },
    handler: async ({ image }) => {
      const result = await exec("push", [image]);
      return { image, success: result.code === 0, error: result.code !== 0 ? result.stderr : undefined };
    },
  },

  podman_build: {
    description: "Build an image",
    params: {
      context: { type: "string", description: "Build context path" },
      tag: { type: "string", description: "Image tag" },
      file: { type: "string", description: "Containerfile path" },
    },
    handler: async ({ context = ".", tag, file }) => {
      const args = [];
      if (tag) args.push("-t", tag);
      if (file) args.push("-f", file);
      args.push(context);
      const result = await exec("build", args);
      return { tag, success: result.code === 0, error: result.code !== 0 ? result.stderr : undefined };
    },
  },

  podman_tag: {
    description: "Tag an image",
    params: {
      source: { type: "string", description: "Source image" },
      target: { type: "string", description: "Target tag" },
    },
    handler: async ({ source, target }) => {
      const result = await exec("tag", [source, target]);
      return { success: result.code === 0 };
    },
  },

  podman_rmi: {
    description: "Remove images",
    params: { images: { type: "string", description: "Image(s), comma-separated" } },
    handler: async ({ images }) => {
      const result = await exec("rmi", images.split(",").map((i) => i.trim()));
      return { removed: images.split(","), success: result.code === 0 };
    },
  },

  podman_save: {
    description: "Save image to archive",
    params: {
      images: { type: "string", description: "Image(s)" },
      output: { type: "string", description: "Output file" },
    },
    handler: async ({ images, output }) => {
      const result = await exec("save", ["-o", output, ...images.split(",")]);
      return { output, success: result.code === 0 };
    },
  },

  podman_load: {
    description: "Load image from archive",
    params: { input: { type: "string", description: "Input file" } },
    handler: async ({ input }) => {
      const result = await exec("load", ["-i", input]);
      return { success: result.code === 0, output: result.stdout };
    },
  },

  // Network
  podman_network_ls: {
    description: "List networks",
    params: {},
    handler: async () => {
      const result = await exec("network", ["ls", "--format", "json"]);
      return { networks: parseJsonOutput(result.stdout) };
    },
  },

  podman_network_create: {
    description: "Create network",
    params: { name: { type: "string", description: "Network name" } },
    handler: async ({ name }) => {
      const result = await exec("network", ["create", name]);
      return { name, success: result.code === 0 };
    },
  },

  podman_network_rm: {
    description: "Remove networks",
    params: { networks: { type: "string", description: "Network(s), comma-separated" } },
    handler: async ({ networks }) => {
      const result = await exec("network", ["rm", ...networks.split(",")]);
      return { removed: networks.split(","), success: result.code === 0 };
    },
  },

  podman_network_inspect: {
    description: "Inspect network",
    params: { network: { type: "string", description: "Network name" } },
    handler: async ({ network }) => {
      const result = await exec("network", ["inspect", network]);
      return parseJsonOutput(result.stdout);
    },
  },

  // Volume
  podman_volume_ls: {
    description: "List volumes",
    params: {},
    handler: async () => {
      const result = await exec("volume", ["ls", "--format", "json"]);
      return { volumes: parseJsonOutput(result.stdout) };
    },
  },

  podman_volume_create: {
    description: "Create volume",
    params: { name: { type: "string", description: "Volume name" } },
    handler: async ({ name }) => {
      const result = await exec("volume", ["create", name]);
      return { name, success: result.code === 0 };
    },
  },

  podman_volume_rm: {
    description: "Remove volumes",
    params: { volumes: { type: "string", description: "Volume(s), comma-separated" } },
    handler: async ({ volumes }) => {
      const result = await exec("volume", ["rm", ...volumes.split(",")]);
      return { removed: volumes.split(","), success: result.code === 0 };
    },
  },

  podman_volume_inspect: {
    description: "Inspect volume",
    params: { volume: { type: "string", description: "Volume name" } },
    handler: async ({ volume }) => {
      const result = await exec("volume", ["inspect", volume]);
      return parseJsonOutput(result.stdout);
    },
  },

  // Compose (podman-compose or podman compose)
  podman_compose_up: {
    description: "Start compose services",
    params: {
      file: { type: "string", description: "Compose file" },
      detach: { type: "boolean", description: "Run in background" },
    },
    handler: async ({ file, detach = true }) => {
      const args = file ? ["-f", file, "up"] : ["up"];
      if (detach) args.push("-d");
      const result = await exec("compose", args);
      return { success: result.code === 0, output: result.stdout, error: result.code !== 0 ? result.stderr : undefined };
    },
  },

  podman_compose_down: {
    description: "Stop compose services",
    params: { file: { type: "string", description: "Compose file" } },
    handler: async ({ file }) => {
      const args = file ? ["-f", file, "down"] : ["down"];
      const result = await exec("compose", args);
      return { success: result.code === 0 };
    },
  },

  podman_compose_ps: {
    description: "List compose services",
    params: { file: { type: "string", description: "Compose file" } },
    handler: async ({ file }) => {
      const args = file ? ["-f", file, "ps", "--format", "json"] : ["ps", "--format", "json"];
      const result = await exec("compose", args);
      return { services: parseJsonOutput(result.stdout) };
    },
  },

  podman_compose_logs: {
    description: "View compose logs",
    params: {
      file: { type: "string", description: "Compose file" },
      service: { type: "string", description: "Service name" },
    },
    handler: async ({ file, service }) => {
      const args = file ? ["-f", file, "logs"] : ["logs"];
      if (service) args.push(service);
      const result = await exec("compose", args);
      return { logs: result.stdout };
    },
  },

  // System
  podman_info: {
    description: "System information",
    params: {},
    handler: async () => {
      const result = await exec("info", ["--format", "json"]);
      return parseJsonOutput(result.stdout);
    },
  },

  podman_version: {
    description: "Version information",
    params: {},
    handler: async () => {
      const result = await exec("version", ["--format", "json"]);
      if (result.code !== 0) {
        const text = await exec("version", []);
        return { version: text.stdout };
      }
      return parseJsonOutput(result.stdout);
    },
  },

  podman_stats: {
    description: "Container stats",
    params: { containers: { type: "string", description: "Container(s)" } },
    handler: async ({ containers }) => {
      const args = ["--format", "json", "--no-stream"];
      if (containers) args.push(...containers.split(","));
      const result = await exec("stats", args);
      return { stats: parseJsonOutput(result.stdout) };
    },
  },

  podman_system_prune: {
    description: "Prune unused resources",
    params: {
      all: { type: "boolean", description: "Remove all unused" },
      volumes: { type: "boolean", description: "Include volumes" },
    },
    handler: async ({ all = false, volumes = false }) => {
      const args = ["-f"];
      if (all) args.push("-a");
      if (volumes) args.push("--volumes");
      const result = await exec("system", ["prune", ...args]);
      return { success: result.code === 0, output: result.stdout };
    },
  },
};
