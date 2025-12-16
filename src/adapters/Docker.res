// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2025 Jonathan D.A. Jewell

/// Docker Adapter
/// Docker CLI - Fallback runtime (FOSS alternatives preferred)
/// Included for compatibility. Consider using nerdctl or podman instead.

open Adapter

let dockerPath = Deno.getEnvOr("DOCKER_PATH", "docker")
let dockerHost = Deno.getEnvOr("DOCKER_HOST", "")

let allowedCommands = [
  "run", "create", "start", "stop", "restart", "kill", "rm", "pause", "unpause",
  "ps", "inspect", "logs", "top", "stats", "port", "diff", "exec", "attach", "cp",
  "export", "images", "pull", "push", "build", "tag", "rmi", "save", "load",
  "image", "history", "network", "volume", "compose", "info", "version", "system",
  "events", "login", "logout",
]

let sanitizeArg = (arg: string): string => {
  arg->String.replaceRegExp(%re("/[;&|`$(){}\\[\\]<>]/g"), "")->String.trim
}

let exec = async (subcommand: string, args: array<string>): Executor.commandResult => {
  if !(allowedCommands->Array.includes(subcommand)) {
    Js.Exn.raiseError(`Command not allowed: ${subcommand}`)
  }

  let baseArgs = []
  if dockerHost != "" {
    baseArgs->Array.push("-H")->ignore
    baseArgs->Array.push(dockerHost)->ignore
  }

  let fullArgs = baseArgs->Array.concat([subcommand])->Array.concat(args->Array.map(sanitizeArg))
  await Executor.executeCommand(dockerPath, fullArgs)
}

let parseJsonOutput = (stdout: string): JSON.t => {
  try {
    let lines = stdout->String.trim->String.split("\n")->Array.filter(line => line != "")
    if lines->Array.length == 0 {
      Obj.magic([])
    } else if lines->Array.length == 1 {
      JSON.parseExn(lines->Array.get(0)->Option.getOr("[]"))
    } else {
      Obj.magic(lines->Array.map(line => JSON.parseExn(line)))
    }
  } catch {
  | _ => Obj.magic({"raw": stdout})
  }
}

let name = "docker"
let description = "Docker CLI - Fallback (prefer nerdctl or podman)"

let connect = async () => {
  let result = await exec("version", [])
  if result.code != 0 {
    Js.Exn.raiseError(`Docker not available: ${result.stderr}`)
  }
}

let disconnect = async () => ()

let isConnected = async () => {
  try {
    let result = await exec("version", [])
    result.code == 0
  } catch {
  | _ => false
  }
}

// Tool handlers
let runHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let image = args->Js.Dict.get("image")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let containerName = args->Js.Dict.get("name")->Option.flatMap(JSON.Decode.string)
  let detach = args->Js.Dict.get("detach")->Option.flatMap(JSON.Decode.bool)->Option.getOr(true)
  let ports = args->Js.Dict.get("ports")->Option.flatMap(JSON.Decode.string)
  let env = args->Js.Dict.get("env")->Option.flatMap(JSON.Decode.string)
  let volumes = args->Js.Dict.get("volumes")->Option.flatMap(JSON.Decode.string)
  let command = args->Js.Dict.get("command")->Option.flatMap(JSON.Decode.string)
  let privileged = args->Js.Dict.get("privileged")->Option.flatMap(JSON.Decode.bool)->Option.getOr(false)
  let nested = args->Js.Dict.get("nested")->Option.flatMap(JSON.Decode.bool)->Option.getOr(false)

  let cmdArgs = []
  if detach { cmdArgs->Array.push("-d")->ignore }
  containerName->Option.forEach(n => { cmdArgs->Array.push("--name")->ignore; cmdArgs->Array.push(n)->ignore })
  if privileged || nested { cmdArgs->Array.push("--privileged")->ignore }
  if nested { cmdArgs->Array.push("-v")->ignore; cmdArgs->Array.push("/var/run/docker.sock:/var/run/docker.sock")->ignore }
  ports->Option.forEach(p => p->String.split(",")->Array.forEach(port => { cmdArgs->Array.push("-p")->ignore; cmdArgs->Array.push(port->String.trim)->ignore }))
  env->Option.forEach(e => {
    try {
      let envObj: Js.Dict.t<string> = JSON.parseExn(e)->Obj.magic
      envObj->Js.Dict.entries->Array.forEach(((k, v)) => { cmdArgs->Array.push("-e")->ignore; cmdArgs->Array.push(`${k}=${v}`)->ignore })
    } catch {
    | _ => { cmdArgs->Array.push("-e")->ignore; cmdArgs->Array.push(e)->ignore }
    }
  })
  volumes->Option.forEach(v => v->String.split(",")->Array.forEach(vol => { cmdArgs->Array.push("-v")->ignore; cmdArgs->Array.push(vol->String.trim)->ignore }))
  cmdArgs->Array.push(image)->ignore
  command->Option.forEach(c => c->String.split(" ")->Array.forEach(a => cmdArgs->Array.push(a)->ignore))

  let result = await exec("run", cmdArgs)
  Obj.magic({
    "containerId": result.stdout->String.trim,
    "success": result.code == 0,
    "nested": nested,
    "privileged": privileged || nested,
    "error": if result.code != 0 { Some(result.stderr) } else { None },
  })
}

let psHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let all = args->Js.Dict.get("all")->Option.flatMap(JSON.Decode.bool)->Option.getOr(false)
  let cmdArgs = ["--format", "json"]
  if all { cmdArgs->Array.push("-a")->ignore }
  let result = await exec("ps", cmdArgs)
  Obj.magic({"containers": parseJsonOutput(result.stdout)})
}

let stopHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let containers = args->Js.Dict.get("containers")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("stop", containers->String.split(",")->Array.map(String.trim))
  Obj.magic({"stopped": containers->String.split(","), "success": result.code == 0})
}

let startHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let containers = args->Js.Dict.get("containers")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("start", containers->String.split(",")->Array.map(String.trim))
  Obj.magic({"started": containers->String.split(","), "success": result.code == 0})
}

let restartHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let containers = args->Js.Dict.get("containers")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("restart", containers->String.split(",")->Array.map(String.trim))
  Obj.magic({"restarted": containers->String.split(","), "success": result.code == 0})
}

let rmHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let containers = args->Js.Dict.get("containers")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let force = args->Js.Dict.get("force")->Option.flatMap(JSON.Decode.bool)->Option.getOr(false)
  let cmdArgs = if force { ["-f"] } else { [] }
  let result = await exec("rm", cmdArgs->Array.concat(containers->String.split(",")->Array.map(String.trim)))
  Obj.magic({"removed": containers->String.split(","), "success": result.code == 0})
}

let logsHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let container = args->Js.Dict.get("container")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let tail = args->Js.Dict.get("tail")->Option.flatMap(JSON.Decode.float)->Option.map(Float.toInt)
  let cmdArgs = switch tail {
  | Some(t) => ["--tail", Int.toString(t), container]
  | None => [container]
  }
  let result = await exec("logs", cmdArgs)
  Obj.magic({"logs": result.stdout, "success": result.code == 0})
}

let execHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let container = args->Js.Dict.get("container")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let command = args->Js.Dict.get("command")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("exec", [container]->Array.concat(command->String.split(" ")))
  Obj.magic({"output": result.stdout, "success": result.code == 0})
}

let inspectHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let target = args->Js.Dict.get("target")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("inspect", [target])
  parseJsonOutput(result.stdout)
}

let cpHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let source = args->Js.Dict.get("source")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let destination = args->Js.Dict.get("destination")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("cp", [source, destination])
  Obj.magic({"success": result.code == 0})
}

let imagesHandler = async (_args: Js.Dict.t<JSON.t>): JSON.t => {
  let result = await exec("images", ["--format", "json"])
  Obj.magic({"images": parseJsonOutput(result.stdout)})
}

let pullHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let image = args->Js.Dict.get("image")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("pull", [image])
  Obj.magic({"image": image, "success": result.code == 0})
}

let pushHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let image = args->Js.Dict.get("image")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("push", [image])
  Obj.magic({"image": image, "success": result.code == 0})
}

let buildHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let context = args->Js.Dict.get("context")->Option.flatMap(JSON.Decode.string)->Option.getOr(".")
  let tag = args->Js.Dict.get("tag")->Option.flatMap(JSON.Decode.string)
  let file = args->Js.Dict.get("file")->Option.flatMap(JSON.Decode.string)
  let cmdArgs = []
  tag->Option.forEach(t => { cmdArgs->Array.push("-t")->ignore; cmdArgs->Array.push(t)->ignore })
  file->Option.forEach(f => { cmdArgs->Array.push("-f")->ignore; cmdArgs->Array.push(f)->ignore })
  cmdArgs->Array.push(context)->ignore
  let result = await exec("build", cmdArgs)
  Obj.magic({"tag": tag, "success": result.code == 0})
}

let tagHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let source = args->Js.Dict.get("source")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let target = args->Js.Dict.get("target")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("tag", [source, target])
  Obj.magic({"success": result.code == 0})
}

let rmiHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let images = args->Js.Dict.get("images")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("rmi", images->String.split(",")->Array.map(String.trim))
  Obj.magic({"removed": images->String.split(","), "success": result.code == 0})
}

let saveHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let images = args->Js.Dict.get("images")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let output = args->Js.Dict.get("output")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("save", ["-o", output]->Array.concat(images->String.split(",")))
  Obj.magic({"output": output, "success": result.code == 0})
}

let loadHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let input = args->Js.Dict.get("input")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("load", ["-i", input])
  Obj.magic({"success": result.code == 0})
}

let networkLsHandler = async (_args: Js.Dict.t<JSON.t>): JSON.t => {
  let result = await exec("network", ["ls", "--format", "json"])
  Obj.magic({"networks": parseJsonOutput(result.stdout)})
}

let networkCreateHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let networkName = args->Js.Dict.get("name")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("network", ["create", networkName])
  Obj.magic({"name": networkName, "success": result.code == 0})
}

let networkRmHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let networks = args->Js.Dict.get("networks")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("network", ["rm"]->Array.concat(networks->String.split(",")))
  Obj.magic({"removed": networks->String.split(","), "success": result.code == 0})
}

let networkInspectHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let network = args->Js.Dict.get("network")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("network", ["inspect", network])
  parseJsonOutput(result.stdout)
}

let volumeLsHandler = async (_args: Js.Dict.t<JSON.t>): JSON.t => {
  let result = await exec("volume", ["ls", "--format", "json"])
  Obj.magic({"volumes": parseJsonOutput(result.stdout)})
}

let volumeCreateHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let volumeName = args->Js.Dict.get("name")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("volume", ["create", volumeName])
  Obj.magic({"name": volumeName, "success": result.code == 0})
}

let volumeRmHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let volumes = args->Js.Dict.get("volumes")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("volume", ["rm"]->Array.concat(volumes->String.split(",")))
  Obj.magic({"removed": volumes->String.split(","), "success": result.code == 0})
}

let volumeInspectHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let volume = args->Js.Dict.get("volume")->Option.flatMap(JSON.Decode.string)->Option.getOr("")
  let result = await exec("volume", ["inspect", volume])
  parseJsonOutput(result.stdout)
}

let composeUpHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let file = args->Js.Dict.get("file")->Option.flatMap(JSON.Decode.string)
  let detach = args->Js.Dict.get("detach")->Option.flatMap(JSON.Decode.bool)->Option.getOr(true)
  let cmdArgs = switch file {
  | Some(f) => ["-f", f, "up"]
  | None => ["up"]
  }
  if detach { cmdArgs->Array.push("-d")->ignore }
  let result = await exec("compose", cmdArgs)
  Obj.magic({"success": result.code == 0})
}

let composeDownHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let file = args->Js.Dict.get("file")->Option.flatMap(JSON.Decode.string)
  let cmdArgs = switch file {
  | Some(f) => ["-f", f, "down"]
  | None => ["down"]
  }
  let result = await exec("compose", cmdArgs)
  Obj.magic({"success": result.code == 0})
}

let composePsHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let file = args->Js.Dict.get("file")->Option.flatMap(JSON.Decode.string)
  let cmdArgs = switch file {
  | Some(f) => ["-f", f, "ps", "--format", "json"]
  | None => ["ps", "--format", "json"]
  }
  let result = await exec("compose", cmdArgs)
  Obj.magic({"services": parseJsonOutput(result.stdout)})
}

let composeLogsHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let file = args->Js.Dict.get("file")->Option.flatMap(JSON.Decode.string)
  let service = args->Js.Dict.get("service")->Option.flatMap(JSON.Decode.string)
  let cmdArgs = switch file {
  | Some(f) => ["-f", f, "logs"]
  | None => ["logs"]
  }
  service->Option.forEach(s => cmdArgs->Array.push(s)->ignore)
  let result = await exec("compose", cmdArgs)
  Obj.magic({"logs": result.stdout})
}

let infoHandler = async (_args: Js.Dict.t<JSON.t>): JSON.t => {
  let result = await exec("info", ["--format", "json"])
  parseJsonOutput(result.stdout)
}

let versionHandler = async (_args: Js.Dict.t<JSON.t>): JSON.t => {
  let result = await exec("version", ["--format", "json"])
  if result.code == 0 {
    parseJsonOutput(result.stdout)
  } else {
    let textResult = await exec("version", [])
    Obj.magic({"version": textResult.stdout})
  }
}

let statsHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let containers = args->Js.Dict.get("containers")->Option.flatMap(JSON.Decode.string)
  let cmdArgs = ["--format", "json", "--no-stream"]
  containers->Option.forEach(c => c->String.split(",")->Array.forEach(cont => cmdArgs->Array.push(cont)->ignore))
  let result = await exec("stats", cmdArgs)
  Obj.magic({"stats": parseJsonOutput(result.stdout)})
}

let systemPruneHandler = async (args: Js.Dict.t<JSON.t>): JSON.t => {
  let all = args->Js.Dict.get("all")->Option.flatMap(JSON.Decode.bool)->Option.getOr(false)
  let volumes = args->Js.Dict.get("volumes")->Option.flatMap(JSON.Decode.bool)->Option.getOr(false)
  let cmdArgs = ["-f"]
  if all { cmdArgs->Array.push("-a")->ignore }
  if volumes { cmdArgs->Array.push("--volumes")->ignore }
  let result = await exec("system", ["prune"]->Array.concat(cmdArgs))
  Obj.magic({"success": result.code == 0})
}

// Tools dictionary
let tools: Js.Dict.t<toolDef> = {
  let dict = Js.Dict.empty()

  Js.Dict.set(dict, "docker_run", {
    description: "Run a container (consider nerdctl_run or podman_run instead)",
    params: Js.Dict.fromArray([
      ("image", stringParam(~description="Image to run")),
      ("name", stringParam(~description="Container name")),
      ("detach", boolParam(~description="Run in background")),
      ("ports", stringParam(~description="Port mappings")),
      ("env", stringParam(~description="Environment variables (JSON)")),
      ("volumes", stringParam(~description="Volume mounts")),
      ("command", stringParam(~description="Command to run")),
      ("privileged", boolParam(~description="Run in privileged mode")),
      ("nested", boolParam(~description="Setup for Docker-in-Docker")),
    ]),
    handler: runHandler,
  })

  Js.Dict.set(dict, "docker_ps", { description: "List containers", params: Js.Dict.fromArray([("all", boolParam(~description="Show all"))]), handler: psHandler })
  Js.Dict.set(dict, "docker_stop", { description: "Stop containers", params: Js.Dict.fromArray([("containers", stringParam(~description="Container(s)"))]), handler: stopHandler })
  Js.Dict.set(dict, "docker_start", { description: "Start containers", params: Js.Dict.fromArray([("containers", stringParam(~description="Container(s)"))]), handler: startHandler })
  Js.Dict.set(dict, "docker_restart", { description: "Restart containers", params: Js.Dict.fromArray([("containers", stringParam(~description="Container(s)"))]), handler: restartHandler })
  Js.Dict.set(dict, "docker_rm", { description: "Remove containers", params: Js.Dict.fromArray([("containers", stringParam(~description="Container(s)")), ("force", boolParam(~description="Force"))]), handler: rmHandler })
  Js.Dict.set(dict, "docker_logs", { description: "Fetch logs", params: Js.Dict.fromArray([("container", stringParam(~description="Container")), ("tail", numberParam(~description="Lines"))]), handler: logsHandler })
  Js.Dict.set(dict, "docker_exec", { description: "Execute command", params: Js.Dict.fromArray([("container", stringParam(~description="Container")), ("command", stringParam(~description="Command"))]), handler: execHandler })
  Js.Dict.set(dict, "docker_inspect", { description: "Inspect", params: Js.Dict.fromArray([("target", stringParam(~description="Target"))]), handler: inspectHandler })
  Js.Dict.set(dict, "docker_cp", { description: "Copy files", params: Js.Dict.fromArray([("source", stringParam(~description="Source")), ("destination", stringParam(~description="Destination"))]), handler: cpHandler })

  Js.Dict.set(dict, "docker_images", { description: "List images", params: Js.Dict.empty(), handler: imagesHandler })
  Js.Dict.set(dict, "docker_pull", { description: "Pull image", params: Js.Dict.fromArray([("image", stringParam(~description="Image"))]), handler: pullHandler })
  Js.Dict.set(dict, "docker_push", { description: "Push image", params: Js.Dict.fromArray([("image", stringParam(~description="Image"))]), handler: pushHandler })
  Js.Dict.set(dict, "docker_build", { description: "Build image", params: Js.Dict.fromArray([("context", stringParam(~description="Context")), ("tag", stringParam(~description="Tag")), ("file", stringParam(~description="File"))]), handler: buildHandler })
  Js.Dict.set(dict, "docker_tag", { description: "Tag image", params: Js.Dict.fromArray([("source", stringParam(~description="Source")), ("target", stringParam(~description="Target"))]), handler: tagHandler })
  Js.Dict.set(dict, "docker_rmi", { description: "Remove images", params: Js.Dict.fromArray([("images", stringParam(~description="Image(s)"))]), handler: rmiHandler })
  Js.Dict.set(dict, "docker_save", { description: "Save image", params: Js.Dict.fromArray([("images", stringParam(~description="Image(s)")), ("output", stringParam(~description="Output"))]), handler: saveHandler })
  Js.Dict.set(dict, "docker_load", { description: "Load image", params: Js.Dict.fromArray([("input", stringParam(~description="Input"))]), handler: loadHandler })

  Js.Dict.set(dict, "docker_network_ls", { description: "List networks", params: Js.Dict.empty(), handler: networkLsHandler })
  Js.Dict.set(dict, "docker_network_create", { description: "Create network", params: Js.Dict.fromArray([("name", stringParam(~description="Name"))]), handler: networkCreateHandler })
  Js.Dict.set(dict, "docker_network_rm", { description: "Remove networks", params: Js.Dict.fromArray([("networks", stringParam(~description="Network(s)"))]), handler: networkRmHandler })
  Js.Dict.set(dict, "docker_network_inspect", { description: "Inspect network", params: Js.Dict.fromArray([("network", stringParam(~description="Network"))]), handler: networkInspectHandler })

  Js.Dict.set(dict, "docker_volume_ls", { description: "List volumes", params: Js.Dict.empty(), handler: volumeLsHandler })
  Js.Dict.set(dict, "docker_volume_create", { description: "Create volume", params: Js.Dict.fromArray([("name", stringParam(~description="Name"))]), handler: volumeCreateHandler })
  Js.Dict.set(dict, "docker_volume_rm", { description: "Remove volumes", params: Js.Dict.fromArray([("volumes", stringParam(~description="Volume(s)"))]), handler: volumeRmHandler })
  Js.Dict.set(dict, "docker_volume_inspect", { description: "Inspect volume", params: Js.Dict.fromArray([("volume", stringParam(~description="Volume"))]), handler: volumeInspectHandler })

  Js.Dict.set(dict, "docker_compose_up", { description: "Start compose", params: Js.Dict.fromArray([("file", stringParam(~description="File")), ("detach", boolParam(~description="Detach"))]), handler: composeUpHandler })
  Js.Dict.set(dict, "docker_compose_down", { description: "Stop compose", params: Js.Dict.fromArray([("file", stringParam(~description="File"))]), handler: composeDownHandler })
  Js.Dict.set(dict, "docker_compose_ps", { description: "List compose services", params: Js.Dict.fromArray([("file", stringParam(~description="File"))]), handler: composePsHandler })
  Js.Dict.set(dict, "docker_compose_logs", { description: "Compose logs", params: Js.Dict.fromArray([("file", stringParam(~description="File")), ("service", stringParam(~description="Service"))]), handler: composeLogsHandler })

  Js.Dict.set(dict, "docker_info", { description: "System info", params: Js.Dict.empty(), handler: infoHandler })
  Js.Dict.set(dict, "docker_version", { description: "Version", params: Js.Dict.empty(), handler: versionHandler })
  Js.Dict.set(dict, "docker_stats", { description: "Stats", params: Js.Dict.fromArray([("containers", stringParam(~description="Container(s)"))]), handler: statsHandler })
  Js.Dict.set(dict, "docker_system_prune", { description: "Prune", params: Js.Dict.fromArray([("all", boolParam(~description="All")), ("volumes", boolParam(~description="Volumes"))]), handler: systemPruneHandler })

  dict
}
