;;; STATE.scm — poly-container-mcp
;; SPDX-License-Identifier: PMPL-1.0-or-later
;; SPDX-FileCopyrightText: 2025 Jonathan D.A. Jewell

(define metadata
  '((version . "1.1.0") (updated . "2025-12-17") (project . "poly-container-mcp")))

(define current-position
  '((phase . "v1.1 - Production Ready")
    (overall-completion . 85)
    (components
     ((rsr-compliance ((status . "complete") (completion . 100)))
      (security ((status . "complete") (completion . 100)))
      (adapters ((status . "complete") (completion . 100)))
      (ci-cd ((status . "complete") (completion . 100)))
      (rescript-core ((status . "in-progress") (completion . 60)))
      (tests ((status . "pending") (completion . 10)))
      (documentation ((status . "complete") (completion . 95)))))))

(define security-status
  '((command-whitelist . "implemented")
    (argument-sanitization . "implemented")
    (no-shell-execution . "implemented")
    (codeql-sast . "enabled")
    (scorecard . "enabled")
    (trufflehog . "enabled")
    (well-known . "implemented")
    (issues . ())))

(define blockers-and-issues
  '((critical ())
    (high-priority ())
    (medium
     (("ReScript deprecation warnings" . "Js.Dict -> Dict migration needed")
      ("package-lock.json missing" . "npm ci fails in CI")))))

(define roadmap
  '((v1.2
     ((milestone . "Test Coverage")
      (tasks
       (("Add unit tests for Executor.res" . pending)
        ("Add integration tests for adapters" . pending)
        ("Set up test coverage reporting" . pending)
        ("Add CI test job" . pending)))))
    (v1.3
     ((milestone . "Full ReScript Migration")
      (tasks
       (("Migrate Js.Dict -> Dict" . pending)
        ("Convert nerdctl.js to ReScript" . pending)
        ("Convert podman.js to ReScript" . pending)
        ("Update rescript.json dependencies field" . pending)))))
    (v2.0
     ((milestone . "Extended Features")
      (tasks
       (("Add Kubernetes/kubectl adapter" . planned)
        ("Add cri-o adapter" . planned)
        ("Add finch adapter" . planned)
        ("Add container health monitoring" . planned)
        ("Add MCP resources support" . planned)))))))

(define critical-next-actions
  '((immediate
     (("Generate package-lock.json" . high)
      ("Fix ReScript deprecation warnings" . medium)))
    (this-week
     (("Add basic unit tests" . medium)
      ("Test Deno Deploy HTTP mode" . medium)))))

(define session-history
  '((snapshots
     ((date . "2025-12-17")
      (session . "security-review")
      (notes . "Full security audit passed. Updated roadmap. ReScript builds with deprecation warnings."))
     ((date . "2025-12-15")
      (session . "initial")
      (notes . "SCM files added")))))

(define state-summary
  '((project . "poly-container-mcp")
    (version . "1.1.0")
    (completion . 85)
    (security-status . "good")
    (blockers . 0)
    (updated . "2025-12-17")))
