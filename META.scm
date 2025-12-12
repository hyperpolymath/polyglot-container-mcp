;; SPDX-License-Identifier: MIT
;; SPDX-FileCopyrightText: 2025 Jonathan D.A. Jewell

;;; META.scm — Architecture Decisions and Development Practices
;;; polyglot-container-mcp

(define-module (polyglot-container-mcp meta)
  #:export (architecture-decisions
            development-practices
            design-rationale))

;;; Architecture Decisions Record (ADR)

(define architecture-decisions
  '((adr-001
     (title . "FOSS-First Runtime Priority")
     (status . "accepted")
     (date . "2025-01-01")
     (context . "Multiple container runtimes exist with varying licenses and philosophies")
     (decision . "Prioritize FOSS runtimes: nerdctl > podman > docker")
     (consequences . ("Docker users can still use the fallback"
                      "Encourages migration to FOSS alternatives"
                      "Aligns with open source values")))

    (adr-002
     (title . "Adapter Pattern for Runtimes")
     (status . "accepted")
     (date . "2025-01-01")
     (context . "Need to support multiple container runtimes with similar but not identical APIs")
     (decision . "Use adapter pattern from polyglot-db-mcp")
     (consequences . ("Consistent interface across runtimes"
                      "Easy to add new runtimes"
                      "Each adapter is self-contained")))

    (adr-003
     (title . "ReScript for Type-Safe Core")
     (status . "accepted")
     (date . "2025-01-01")
     (context . "Need type safety without TypeScript")
     (decision . "Use ReScript for core modules (Executor, Adapter interface)")
     (consequences . ("Compile-time type checking"
                      "Clean JavaScript output"
                      "No TypeScript in project")))

    (adr-004
     (title . "Command Whitelist Security")
     (status . "accepted")
     (date . "2025-01-01")
     (context . "Container CLIs are powerful and potentially dangerous")
     (decision . "Whitelist allowed subcommands, sanitize arguments, no shell execution")
     (consequences . ("Prevents command injection"
                      "Limits functionality to safe operations"
                      "May need updates for new features")))

    (adr-005
     (title . "FOSS Base Images Only")
     (status . "accepted")
     (date . "2025-01-01")
     (context . "Container images need base distributions")
     (decision . "Use only FOSS bases: Wolfi (via apko), Alpine, Fedora")
     (consequences . ("No Chainguard auth required"
                      "Fully open source supply chain"
                      "Community-maintained images")))))

;;; Development Practices

(define development-practices
  '((code-style
     (formatter . "deno fmt")
     (linter . "deno lint")
     (type-system . "ReScript (preferred) or untyped JavaScript"))

    (security
     (command-execution . "Deno.Command only, never shell")
     (input-validation . "Whitelist + sanitization")
     (credentials . "Never in code, always env vars"))

    (documentation
     (format . "AsciiDoc")
     (api-docs . "Generated from tool definitions")
     (changelogs . "Keep a CHANGELOG format"))

    (testing
     (manual . "Test with each runtime")
     (automated . "Planned for future"))

    (versioning
     (scheme . "Semantic Versioning 2.0.0")
     (changelog . "Keep a CHANGELOG format"))))

;;; Design Rationale

(define design-rationale
  '((why-multiple-runtimes
     "The container ecosystem has diversified beyond Docker. nerdctl provides
      containerd access with Docker compatibility. podman offers rootless,
      daemonless operation. Supporting all three maximizes compatibility
      while encouraging FOSS adoption.")

    (why-rescript
     "ReScript provides compile-time type safety without the complexity of
      TypeScript. It generates clean, readable JavaScript that works well
      with Deno. The ML-family syntax encourages functional patterns.")

    (why-deno
     "Deno provides a secure runtime with built-in TypeScript support (though
      we use ReScript), first-class async/await, and modern JavaScript. Its
      permission model aligns with our security goals.")

    (why-wolfi-first
     "Wolfi is purpose-built for containers, minimal, and fully open source.
      Unlike Chainguard's commercial offerings, the community Wolfi images
      require no authentication. This aligns with FOSS-first philosophy.")))
