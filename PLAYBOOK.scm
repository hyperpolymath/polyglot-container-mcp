; SPDX-License-Identifier: PMPL-1.0-or-later
; PLAYBOOK.scm - Operational playbook for poly-container-mcp
; Media type: application/vnd.playbook+scm

(playbook
  (metadata
    (version "1.0.0")
    (schema-version "1.0")
    (created "2026-01-30")
    (updated "2026-01-30"))

  (quick-start
    (prerequisites "Rust 1.70+" "cargo" "Just (optional)")
    (steps
      (step 1 "Clone" "git clone https://github.com/hyperpolymath/poly-container-mcp")
      (step 2 "Build" "cargo build --release")
      (step 3 "Test" "cargo test")
      (step 4 "Run" "cargo run --release")))

  (common-tasks
    (development
      (task "Build" (command "cargo build") (when "Development"))
      (task "Test" (command "cargo test --all-features") (when "Before commit"))
      (task "Lint" (command "cargo clippy -- -D warnings") (when "Code quality"))
      (task "Format" (command "cargo fmt") (when "Before commit")))
    (operations
      (task "Run" (command "cargo run --release") (when "Production"))))

  (troubleshooting
    (issue "Build fails"
      (symptoms "Compilation errors")
      (diagnosis "Check Rust version >= 1.70")
      (resolution "rustup update stable")))

  (maintenance
    (weekly (task "Run tests"))
    (monthly (task "Update deps" "cargo update") (task "Audit" "cargo audit"))))
