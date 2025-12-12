// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2025 Jonathan D.A. Jewell

/**
 * Deno.res - ReScript bindings for Deno APIs
 *
 * Provides type-safe access to Deno runtime APIs.
 */

// Command result type
type commandResult = {
  stdout: string,
  stderr: string,
  code: int,
}

// Environment variable access
@scope("Deno") @val
external envGet: string => option<string> = "env.get"

// Text decoder for command output
@new external makeTextDecoder: unit => {"decode": (. Js.TypedArray2.Uint8Array.t) => string} = "TextDecoder"

// Check if a binary exists in PATH
let checkBinaryExists = async (binary: string): bool => {
  try {
    // Use 'which' on Unix-like systems
    let cmd = %raw(`new Deno.Command("which", { args: [binary], stdout: "piped", stderr: "piped" })`)
    let output = await %raw(`cmd.output()`)
    let code: int = %raw(`output.code`)
    code === 0
  } catch {
  | _ => false
  }
}

// Execute a command and return result
let executeCommand = async (binary: string, args: array<string>): commandResult => {
  let cmd = %raw(`new Deno.Command(binary, { args: args, stdout: "piped", stderr: "piped" })`)
  let output = await %raw(`cmd.output()`)

  let decoder = makeTextDecoder()
  let stdout: Js.TypedArray2.Uint8Array.t = %raw(`output.stdout`)
  let stderr: Js.TypedArray2.Uint8Array.t = %raw(`output.stderr`)
  let code: int = %raw(`output.code`)

  {
    stdout: decoder["decode"](. stdout),
    stderr: decoder["decode"](. stderr),
    code,
  }
}

// Get environment variable with default
let getEnvOr = (key: string, default: string): string => {
  switch envGet(key) {
  | Some(value) => value
  | None => default
  }
}
