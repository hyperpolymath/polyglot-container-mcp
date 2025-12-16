// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2025 Jonathan D.A. Jewell

/**
 * Adapter.res - Adapter interface types for container runtimes
 *
 * Defines the common interface that all runtime adapters must implement.
 */

// Parameter definition for MCP tools
type paramDef = {
  @as("type") type_: string,
  description: string,
}

// Tool definition
type toolDef = {
  description: string,
  params: dict<paramDef>,
  handler: dict<JSON.t> => promise<JSON.t>,
}

// Adapter interface (module type)
module type Adapter = {
  // Adapter metadata
  let name: string
  let description: string

  // Lifecycle methods
  let connect: unit => promise<unit>
  let disconnect: unit => promise<unit>
  let isConnected: unit => promise<bool>

  // Tools registry
  let tools: dict<toolDef>
}

// Helper to create a parameter definition
let makeParam = (~type_: string, ~description: string): paramDef => {
  {type_, description}
}

// Helper to create a string parameter
let stringParam = (~description: string): paramDef => {
  makeParam(~type_="string", ~description)
}

// Helper to create a number parameter
let numberParam = (~description: string): paramDef => {
  makeParam(~type_="number", ~description)
}

// Helper to create a boolean parameter
let boolParam = (~description: string): paramDef => {
  makeParam(~type_="boolean", ~description)
}

// Common tool categories
type toolCategory =
  | Container   // run, ps, stop, start, rm, etc.
  | Image       // images, pull, push, build, etc.
  | Network     // network ls, create, rm, etc.
  | Volume      // volume ls, create, rm, etc.
  | Compose     // compose up, down, ps, etc.
  | System      // info, version, stats, etc.

// Tool naming convention: {runtime}_{category}_{action}
// e.g., nerdctl_container_run, podman_image_pull, docker_network_ls
