// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2025 Jonathan D.A. Jewell

/**
 * Executor.res - Safe command execution for container runtimes
 *
 * Provides type-safe, secure execution of container CLI commands
 * with whitelist validation and argument sanitization.
 */

// Runtime types
type runtime = Nerdctl | Podman | Docker

// Command result type
type commandResult = {
  stdout: string,
  stderr: string,
  code: int,
}

// Execution error type
type execError =
  | CommandNotAllowed(string)
  | ExecutionFailed(string)
  | RuntimeNotFound(string)

// Allowed subcommands (whitelist approach)
let allowedCommands = [
  // Container lifecycle
  "run", "create", "start", "stop", "restart", "kill", "rm", "pause", "unpause",
  // Container inspection
  "ps", "inspect", "logs", "top", "stats", "port", "diff",
  // Container interaction
  "exec", "attach", "cp", "export",
  // Image management
  "images", "pull", "push", "build", "tag", "rmi", "save", "load",
  "image", "history",
  // Network management
  "network",
  // Volume management
  "volume",
  // Compose
  "compose",
  // System
  "info", "version", "system", "events",
  // Registry
  "login", "logout",
]

// Get binary name for runtime
let getBinary = (runtime: runtime): string => {
  switch runtime {
  | Nerdctl => "nerdctl"
  | Podman => "podman"
  | Docker => "docker"
  }
}

// Sanitize argument to prevent shell injection
// Removes shell metacharacters
let sanitizeArg = (arg: string): string => {
  // Remove dangerous shell metacharacters
  arg
  ->Js.String2.replaceByRe(%re("/[;&|`$(){}\\[\\]<>]/g"), "")
  ->Js.String2.trim
}

// Validate command is in whitelist
let validateCommand = (subcommand: string): bool => {
  allowedCommands->Js.Array2.includes(subcommand)
}

// Check if runtime binary exists
@module("./bindings/Deno.res.js")
external checkBinaryExists: string => promise<bool> = "checkBinaryExists"

// Execute command using Deno.Command
@module("./bindings/Deno.res.js")
external executeCommand: (string, array<string>) => promise<commandResult> = "executeCommand"

// Main execution function
let exec = async (
  runtime: runtime,
  subcommand: string,
  args: array<string>
): result<commandResult, execError> => {
  // Validate command is allowed
  if !validateCommand(subcommand) {
    Error(CommandNotAllowed(subcommand))
  } else {
    let binary = getBinary(runtime)

    // Sanitize all arguments
    let sanitizedArgs = args->Js.Array2.map(sanitizeArg)

    // Build full args array
    let fullArgs = [subcommand]->Js.Array2.concat(sanitizedArgs)

    try {
      let result = await executeCommand(binary, fullArgs)
      Ok(result)
    } catch {
    | Js.Exn.Error(e) =>
      let message = Js.Exn.message(e)->Belt.Option.getWithDefault("Unknown error")
      Error(ExecutionFailed(message))
    }
  }
}

// Execute with JSON output format (most container CLIs support --format json)
let execJson = async (
  runtime: runtime,
  subcommand: string,
  args: array<string>
): result<commandResult, execError> => {
  // Add --format json for supported commands
  let jsonArgs = switch subcommand {
  | "ps" | "images" | "inspect" | "network" | "volume" | "info" | "version" =>
    args->Js.Array2.concat(["--format", "json"])
  | _ => args
  }

  await exec(runtime, subcommand, jsonArgs)
}

// Detect available runtimes
let detectRuntimes = async (): array<runtime> => {
  let available = []

  // Check nerdctl
  if await checkBinaryExists("nerdctl") {
    available->Js.Array2.push(Nerdctl)->ignore
  }

  // Check podman
  if await checkBinaryExists("podman") {
    available->Js.Array2.push(Podman)->ignore
  }

  // Check docker
  if await checkBinaryExists("docker") {
    available->Js.Array2.push(Docker)->ignore
  }

  available
}

// Get preferred runtime (FOSS first)
let getPreferredRuntime = async (): option<runtime> => {
  let available = await detectRuntimes()

  // Priority: nerdctl > podman > docker
  if available->Js.Array2.includes(Nerdctl) {
    Some(Nerdctl)
  } else if available->Js.Array2.includes(Podman) {
    Some(Podman)
  } else if available->Js.Array2.includes(Docker) {
    Some(Docker)
  } else {
    None
  }
}
