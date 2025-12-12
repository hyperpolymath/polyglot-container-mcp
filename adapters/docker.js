// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2025 Jonathan D.A. Jewell

/**
 * docker Adapter
 * Docker CLI - Fallback runtime (FOSS alternatives preferred)
 *
 * Included for compatibility. Consider using nerdctl or podman instead.
 */

const DOCKER_PATH = Deno.env.get("DOCKER_PATH") || "docker";
const DOCKER_HOST = Deno.env.get("DOCKER_HOST") || "";

const ALLOWED_COMMANDS = [
  "run", "create", "start", "stop", "restart", "kill", "rm", "pause", "unpause",
  "ps", "inspect", "logs", "top", "stats", "port", "diff", "exec", "attach", "cp",
  "export", "images", "pull", "push", "build", "tag", "rmi", "save", "load",
  "image", "history", "network", "volume", "compose", "info", "version", "system",
  "events", "login", "logout"
];

function sanitizeArg(arg) {
  if (typeof arg !== "string") return String(arg);
  return arg.replace(/[;&|`$(){}[\]<>]/g, "").trim();
}

async function exec(subcommand, args = []) {
  if (!ALLOWED_COMMANDS.includes(subcommand)) {
    throw new Error(`Command not allowed: ${subcommand}`);
  }

  const baseArgs = [];
  if (DOCKER_HOST) baseArgs.push("-H", DOCKER_HOST);

  const fullArgs = [...baseArgs, subcommand, ...args.map(sanitizeArg)];
  const cmd = new Deno.Command(DOCKER_PATH, { args: fullArgs, stdout: "piped", stderr: "piped" });
  const output = await cmd.output();
  const decoder = new TextDecoder();

  return { stdout: decoder.decode(output.stdout), stderr: decoder.decode(output.stderr), code: output.code };
}

function parseJsonOutput(stdout) {
  try {
    const lines = stdout.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return [];
    if (lines.length === 1) return JSON.parse(lines[0]);
    return lines.map((line) => JSON.parse(line));
  } catch { return { raw: stdout }; }
}

export const name = "docker";
export const description = "Docker CLI - Fallback (prefer nerdctl or podman)";

export async function connect() {
  const result = await exec("version");
  if (result.code !== 0) throw new Error(`Docker not available: ${result.stderr}`);
}

export async function disconnect() {}

export async function isConnected() {
  try { return (await exec("version")).code === 0; }
  catch { return false; }
}

export const tools = {
  // Container Lifecycle
  docker_run: {
    description: "Run a container (consider nerdctl_run or podman_run instead)",
    params: {
      image: { type: "string", description: "Image to run" },
      name: { type: "string", description: "Container name" },
      detach: { type: "boolean", description: "Run in background" },
      ports: { type: "string", description: "Port mappings" },
      env: { type: "string", description: "Environment variables (JSON)" },
      volumes: { type: "string", description: "Volume mounts" },
      command: { type: "string", description: "Command to run" },
      privileged: { type: "boolean", description: "Run in privileged mode (for nested containers)" },
      securityOpt: { type: "string", description: "Security options, comma-separated" },
      cgroupns: { type: "string", description: "Cgroup namespace mode (host, private)" },
      nested: { type: "boolean", description: "Setup for Docker-in-Docker (mounts docker socket)" },
    },
    handler: async ({ image, name, detach = true, ports, env, volumes, command, privileged, securityOpt, cgroupns, nested }) => {
      const args = [];
      if (detach) args.push("-d");
      if (name) args.push("--name", name);
      if (privileged) args.push("--privileged");
      if (cgroupns) args.push("--cgroupns", cgroupns);

      // Nested container setup - Docker-in-Docker (DinD)
      if (nested) {
        args.push("-v", "/var/run/docker.sock:/var/run/docker.sock");
        if (!privileged) args.push("--privileged");
      }

      if (securityOpt) {
        securityOpt.split(",").forEach((opt) => args.push("--security-opt", opt.trim()));
      }

      if (ports) ports.split(",").forEach((p) => args.push("-p", p.trim()));
      if (env) {
        try { Object.entries(JSON.parse(env)).forEach(([k, v]) => args.push("-e", `${k}=${v}`)); }
        catch { args.push("-e", env); }
      }
      if (volumes) volumes.split(",").forEach((v) => args.push("-v", v.trim()));
      args.push(image);
      if (command) args.push(...command.split(" "));
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

  docker_ps: {
    description: "List containers",
    params: { all: { type: "boolean", description: "Show all" } },
    handler: async ({ all = false }) => {
      const args = ["--format", "json"];
      if (all) args.push("-a");
      const result = await exec("ps", args);
      return { containers: parseJsonOutput(result.stdout) };
    },
  },

  docker_stop: {
    description: "Stop containers",
    params: { containers: { type: "string", description: "Container(s)" } },
    handler: async ({ containers }) => {
      const result = await exec("stop", containers.split(",").map((c) => c.trim()));
      return { stopped: containers.split(","), success: result.code === 0 };
    },
  },

  docker_start: {
    description: "Start containers",
    params: { containers: { type: "string", description: "Container(s)" } },
    handler: async ({ containers }) => {
      const result = await exec("start", containers.split(",").map((c) => c.trim()));
      return { started: containers.split(","), success: result.code === 0 };
    },
  },

  docker_restart: {
    description: "Restart containers",
    params: { containers: { type: "string", description: "Container(s)" } },
    handler: async ({ containers }) => {
      const result = await exec("restart", containers.split(",").map((c) => c.trim()));
      return { restarted: containers.split(","), success: result.code === 0 };
    },
  },

  docker_rm: {
    description: "Remove containers",
    params: { containers: { type: "string", description: "Container(s)" }, force: { type: "boolean", description: "Force" } },
    handler: async ({ containers, force = false }) => {
      const args = force ? ["-f", ...containers.split(",")] : containers.split(",");
      const result = await exec("rm", args.map((a) => a.trim()));
      return { removed: containers.split(","), success: result.code === 0 };
    },
  },

  docker_logs: {
    description: "Fetch logs",
    params: { container: { type: "string", description: "Container" }, tail: { type: "number", description: "Lines" } },
    handler: async ({ container, tail }) => {
      const args = tail ? ["--tail", String(tail), container] : [container];
      const result = await exec("logs", args);
      return { logs: result.stdout, success: result.code === 0 };
    },
  },

  docker_exec: {
    description: "Execute command",
    params: { container: { type: "string", description: "Container" }, command: { type: "string", description: "Command" } },
    handler: async ({ container, command }) => {
      const result = await exec("exec", [container, ...command.split(" ")]);
      return { output: result.stdout, success: result.code === 0 };
    },
  },

  docker_inspect: {
    description: "Inspect",
    params: { target: { type: "string", description: "Target" } },
    handler: async ({ target }) => parseJsonOutput((await exec("inspect", [target])).stdout),
  },

  docker_cp: {
    description: "Copy files",
    params: { source: { type: "string", description: "Source" }, destination: { type: "string", description: "Destination" } },
    handler: async ({ source, destination }) => ({ success: (await exec("cp", [source, destination])).code === 0 }),
  },

  // Images
  docker_images: {
    description: "List images",
    params: {},
    handler: async () => ({ images: parseJsonOutput((await exec("images", ["--format", "json"])).stdout) }),
  },

  docker_pull: {
    description: "Pull image",
    params: { image: { type: "string", description: "Image" } },
    handler: async ({ image }) => ({ image, success: (await exec("pull", [image])).code === 0 }),
  },

  docker_push: {
    description: "Push image",
    params: { image: { type: "string", description: "Image" } },
    handler: async ({ image }) => ({ image, success: (await exec("push", [image])).code === 0 }),
  },

  docker_build: {
    description: "Build image",
    params: { context: { type: "string", description: "Context" }, tag: { type: "string", description: "Tag" }, file: { type: "string", description: "File" } },
    handler: async ({ context = ".", tag, file }) => {
      const args = [];
      if (tag) args.push("-t", tag);
      if (file) args.push("-f", file);
      args.push(context);
      return { tag, success: (await exec("build", args)).code === 0 };
    },
  },

  docker_tag: {
    description: "Tag image",
    params: { source: { type: "string", description: "Source" }, target: { type: "string", description: "Target" } },
    handler: async ({ source, target }) => ({ success: (await exec("tag", [source, target])).code === 0 }),
  },

  docker_rmi: {
    description: "Remove images",
    params: { images: { type: "string", description: "Image(s)" } },
    handler: async ({ images }) => ({ removed: images.split(","), success: (await exec("rmi", images.split(","))).code === 0 }),
  },

  docker_save: {
    description: "Save image",
    params: { images: { type: "string", description: "Image(s)" }, output: { type: "string", description: "Output" } },
    handler: async ({ images, output }) => ({ output, success: (await exec("save", ["-o", output, ...images.split(",")])).code === 0 }),
  },

  docker_load: {
    description: "Load image",
    params: { input: { type: "string", description: "Input" } },
    handler: async ({ input }) => ({ success: (await exec("load", ["-i", input])).code === 0 }),
  },

  // Network
  docker_network_ls: { description: "List networks", params: {}, handler: async () => ({ networks: parseJsonOutput((await exec("network", ["ls", "--format", "json"])).stdout) }) },
  docker_network_create: { description: "Create network", params: { name: { type: "string", description: "Name" } }, handler: async ({ name }) => ({ name, success: (await exec("network", ["create", name])).code === 0 }) },
  docker_network_rm: { description: "Remove networks", params: { networks: { type: "string", description: "Network(s)" } }, handler: async ({ networks }) => ({ removed: networks.split(","), success: (await exec("network", ["rm", ...networks.split(",")])).code === 0 }) },
  docker_network_inspect: { description: "Inspect network", params: { network: { type: "string", description: "Network" } }, handler: async ({ network }) => parseJsonOutput((await exec("network", ["inspect", network])).stdout) },

  // Volume
  docker_volume_ls: { description: "List volumes", params: {}, handler: async () => ({ volumes: parseJsonOutput((await exec("volume", ["ls", "--format", "json"])).stdout) }) },
  docker_volume_create: { description: "Create volume", params: { name: { type: "string", description: "Name" } }, handler: async ({ name }) => ({ name, success: (await exec("volume", ["create", name])).code === 0 }) },
  docker_volume_rm: { description: "Remove volumes", params: { volumes: { type: "string", description: "Volume(s)" } }, handler: async ({ volumes }) => ({ removed: volumes.split(","), success: (await exec("volume", ["rm", ...volumes.split(",")])).code === 0 }) },
  docker_volume_inspect: { description: "Inspect volume", params: { volume: { type: "string", description: "Volume" } }, handler: async ({ volume }) => parseJsonOutput((await exec("volume", ["inspect", volume])).stdout) },

  // Compose
  docker_compose_up: {
    description: "Start compose",
    params: { file: { type: "string", description: "File" }, detach: { type: "boolean", description: "Detach" } },
    handler: async ({ file, detach = true }) => {
      const args = file ? ["-f", file, "up"] : ["up"];
      if (detach) args.push("-d");
      return { success: (await exec("compose", args)).code === 0 };
    },
  },
  docker_compose_down: { description: "Stop compose", params: { file: { type: "string", description: "File" } }, handler: async ({ file }) => ({ success: (await exec("compose", file ? ["-f", file, "down"] : ["down"])).code === 0 }) },
  docker_compose_ps: { description: "List compose services", params: { file: { type: "string", description: "File" } }, handler: async ({ file }) => ({ services: parseJsonOutput((await exec("compose", file ? ["-f", file, "ps", "--format", "json"] : ["ps", "--format", "json"])).stdout) }) },
  docker_compose_logs: { description: "Compose logs", params: { file: { type: "string", description: "File" }, service: { type: "string", description: "Service" } }, handler: async ({ file, service }) => { const args = file ? ["-f", file, "logs"] : ["logs"]; if (service) args.push(service); return { logs: (await exec("compose", args)).stdout }; } },

  // System
  docker_info: { description: "System info", params: {}, handler: async () => parseJsonOutput((await exec("info", ["--format", "json"])).stdout) },
  docker_version: { description: "Version", params: {}, handler: async () => { const r = await exec("version", ["--format", "json"]); return r.code === 0 ? parseJsonOutput(r.stdout) : { version: (await exec("version", [])).stdout }; } },
  docker_stats: { description: "Stats", params: { containers: { type: "string", description: "Container(s)" } }, handler: async ({ containers }) => { const args = ["--format", "json", "--no-stream"]; if (containers) args.push(...containers.split(",")); return { stats: parseJsonOutput((await exec("stats", args)).stdout) }; } },
  docker_system_prune: { description: "Prune", params: { all: { type: "boolean", description: "All" }, volumes: { type: "boolean", description: "Volumes" } }, handler: async ({ all, volumes }) => { const args = ["-f"]; if (all) args.push("-a"); if (volumes) args.push("--volumes"); return { success: (await exec("system", ["prune", ...args])).code === 0 }; } },
};
