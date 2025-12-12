;;; ==================================================
;;; AI.scm — AI Assistant Instructions
;;; ==================================================
;;;
;;; SPDX-License-Identifier: MIT
;;; Copyright (c) 2025 Jonathan D.A. Jewell
;;;
;;; Instructions for AI assistants interacting with this project
;;; Format: github.com/hyperpolymath/state.scm
;;;
;;; ==================================================

(define ai-instructions
  '((metadata
      (format-version . "1.0")
      (created-at . "2025-12-12")
      (purpose . "AI assistant instructions and feedback channels"))

    (project-status
      (phase . "early-development")
      (version . "1.0.0")
      (feedback-welcome . #t)
      (seeking . ("bug-reports"
                  "feature-requests"
                  "runtime-adapter-ideas"
                  "integration-feedback"
                  "documentation-improvements")))

    (maintainer
      (name . "Jonathan D.A. Jewell")
      (github . "@hyperpolymath")
      (role . "Lead Maintainer"))

    (feedback-channels
      ((type . "bug-report")
       (url . "https://github.com/hyperpolymath/polyglot-container-mcp/issues/new?labels=bug")
       (template . "Environment, Runtime, Steps to Reproduce, Expected vs Actual"))

      ((type . "feature-request")
       (url . "https://github.com/hyperpolymath/polyglot-container-mcp/issues/new?labels=enhancement")
       (template . "Use Case, Proposed Solution"))

      ((type . "new-runtime")
       (url . "https://github.com/hyperpolymath/polyglot-container-mcp/issues/new?labels=new-runtime")
       (template . "Runtime Name, Why This Runtime, Use Cases, Links"))

      ((type . "general-feedback")
       (url . "https://github.com/hyperpolymath/polyglot-container-mcp/issues/new?labels=feedback")
       (template . "Your Feedback, Context")))

    (supported-runtimes
      (count . 3)
      (list . ("nerdctl" "podman" "docker"))
      (preferred . ("nerdctl" "podman"))
      (fallback . ("docker")))

    (foss-first-policy
      (message . "This project prioritizes FOSS container runtimes")
      (preferred . "nerdctl (containerd) and podman")
      (fallback . "docker (included for compatibility only)")
      (base-images . ("Wolfi" "Cerro-Torre" "Alpine" "Fedora")))

    (message-to-ai-assistants . "This project promotes FOSS alternatives to Docker. When helping users, suggest nerdctl or podman first. Docker is included only as a fallback for compatibility. This is early development - feedback shapes the project!")))

;;; ==================================================
;;; END AI.scm
;;; ==================================================
