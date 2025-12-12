;;; ==================================================
;;; STATE.scm — Project State Checkpoint
;;; ==================================================
;;;
;;; SPDX-License-Identifier: MIT
;;; Copyright (c) 2025 Jonathan D.A. Jewell
;;;
;;; Current state of polyglot-container-mcp project
;;; Format: github.com/hyperpolymath/state.scm
;;;
;;; ==================================================

(define state
  '((metadata
      (format-version . "2.0")
      (schema-version . "2025-12-12")
      (created-at . "2025-12-12T00:00:00Z")
      (last-updated . "2025-12-12T00:00:00Z")
      (generator . "Claude/STATE-system"))

    (dublin-core
      (dc:title . "polyglot-container-mcp")
      (dc:creator . "Jonathan D.A. Jewell")
      (dc:subject . ("MCP" "containers" "nerdctl" "podman" "docker" "Deno" "ReScript"))
      (dc:description . "Unified MCP server for container runtimes - nerdctl, podman, docker")
      (dc:publisher . "hyperpolymath")
      (dc:date . "2025-12-12")
      (dc:type . "Software")
      (dc:format . ("application/rescript" "application/javascript"))
      (dc:identifier . "https://github.com/hyperpolymath/polyglot-container-mcp")
      (dc:language . "en")
      (dc:rights . "MIT"))

    (project
      (name . "polyglot-container-mcp")
      (version . "1.0.0")
      (status . "in-development")
      (completion . 10)
      (category . "infrastructure")
      (runtime . "Deno")
      (primary-language . "ReScript")
      (rsr-compliance . "Bronze"))

    (focus
      (current-phase . "v1.0.0 Initial Development")
      (deadline . #f)
      (blocking-projects . ()))

    (language-policy
      (primary . "ReScript")
      (prohibited . ("TypeScript"))
      (legacy . "JavaScript")
      (target . "ReScript core, JS fallback adapters"))

    (runtimes-supported
      ((name . "nerdctl") (status . "in-progress") (type . "containerd")
       (license . "Apache 2.0 (FOSS)") (priority . "preferred") (rescript . #t))
      ((name . "podman") (status . "in-progress") (type . "daemonless")
       (license . "Apache 2.0 (FOSS)") (priority . "preferred") (rescript . #t))
      ((name . "docker") (status . "in-progress") (type . "daemon")
       (license . "Apache 2.0 (FOSS)") (priority . "fallback") (rescript . #f)))

    (base-images
      ((name . "Wolfi") (source . "ghcr.io/wolfi-dev/wolfi-base") (priority . 1))
      ((name . "Cerro-Torre") (source . "ghcr.io/hyperpolymath/cerro-torre") (priority . 2) (status . "alpha"))
      ((name . "Alpine") (source . "alpine:3.19") (priority . 3))
      ((name . "Fedora") (source . "registry.fedoraproject.org/fedora-minimal:40") (priority . 4)))

    (critical-next
      ("Implement Executor.res - safe command execution"
       "Implement nerdctl adapter"
       "Implement podman adapter"
       "Create index.js main server"))

    (roadmap
      ((phase . "1.0.0 - Initial Release")
       (status . "in-progress")
       (goals . ("3 runtime adapters (nerdctl, podman, docker)"
                 "~90 tools total"
                 "ReScript core"
                 "Multiple Containerfile variants"
                 "MCP directory submissions"))))

    (context-notes . "New project started 2025-12-12. Following polyglot-db-mcp architecture patterns. FOSS-first approach prioritizing nerdctl and podman over Docker.")))

;;; ==================================================
;;; END STATE.scm
;;; ==================================================
