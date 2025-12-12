;; SPDX-License-Identifier: MIT
;; SPDX-FileCopyrightText: 2025 Jonathan D.A. Jewell

;;; ECOSYSTEM.scm — Related Projects and Integrations
;;; polyglot-container-mcp

(define-module (polyglot-container-mcp ecosystem)
  #:export (sibling-projects
            upstream-dependencies
            downstream-users
            related-technologies))

;;; Sibling Projects (Same Author/Organization)

(define sibling-projects
  '((polyglot-db-mcp
     (repository . "https://github.com/hyperpolymath/polyglot-db-mcp")
     (description . "Multi-database MCP server (PostgreSQL, MySQL, SQLite, etc.)")
     (relationship . "Sister project, same architecture pattern")
     (shared-patterns . ("Adapter pattern"
                         "ReScript core"
                         "Deno runtime"
                         "AsciiDoc documentation"
                         "Scheme metadata files")))

    (cerro-torre
     (repository . "https://github.com/hyperpolymath/Cerro-Torre")
     (description . "Supply-chain verified container distribution")
     (relationship . "Container base image (alpha)")
     (integration . "Containerfile.cerro-torre uses as base image"))

    ;; Future planned projects
    (polyglot-ssg-mcp
     (status . "planned")
     (description . "Multi-SSG MCP server (Zola, Serum, Hugo, etc.)")
     (relationship . "Future sister project"))))

;;; Upstream Dependencies

(define upstream-dependencies
  '((mcp-sdk
     (package . "@modelcontextprotocol/sdk")
     (repository . "https://github.com/anthropics/mcp")
     (purpose . "MCP protocol implementation"))

    (deno
     (url . "https://deno.land")
     (version . ">=2.0.0")
     (purpose . "JavaScript/TypeScript runtime"))

    (rescript
     (url . "https://rescript-lang.org")
     (version . ">=11.0.0")
     (purpose . "Type-safe language compiling to JavaScript"))

    (container-runtimes
     (nerdctl . "https://github.com/containerd/nerdctl")
     (podman . "https://podman.io")
     (docker . "https://docker.com")
     (purpose . "Container runtime CLIs"))

    (base-images
     (wolfi . "https://github.com/wolfi-dev")
     (alpine . "https://alpinelinux.org")
     (fedora . "https://fedoraproject.org"))))

;;; Related Technologies

(define related-technologies
  '((containerd
     (url . "https://containerd.io")
     (relationship . "nerdctl's underlying runtime"))

    (buildah
     (url . "https://buildah.io")
     (relationship . "Potential future adapter for image building"))

    (skopeo
     (url . "https://github.com/containers/skopeo")
     (relationship . "Potential future adapter for image operations"))

    (cosign
     (url . "https://github.com/sigstore/cosign")
     (relationship . "Image signing/verification (potential integration)"))

    (oci
     (url . "https://opencontainers.org")
     (relationship . "Open Container Initiative standards"))

    (kubernetes
     (url . "https://kubernetes.io")
     (relationship . "Container orchestration (nerdctl/podman can interact)"))))

;;; Integration Patterns

(define integration-patterns
  '((claude-desktop
     (config-file . "~/.config/claude-desktop/config.json")
     (transport . "stdio")
     (example . "See README.adoc"))

    (mcp-inspector
     (purpose . "Testing and debugging MCP servers")
     (usage . "npx @anthropic/mcp-inspector"))

    (ci-cd
     (github-actions . "Planned for container image builds")
     (containerfile . "Multi-variant builds supported"))))
