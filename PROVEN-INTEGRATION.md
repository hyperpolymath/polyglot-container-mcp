# Proven Library Integration Plan

This document outlines how the [proven](https://github.com/hyperpolymath/proven) library's formally verified modules can be integrated into poly-container-mcp.

## Applicable Modules

### High Priority

| Module | Use Case | Formal Guarantee |
|--------|----------|------------------|
| `SafeResource` | Container lifecycle | Valid state transitions |
| `SafeCapability` | Container capabilities | Linux capability handling |
| `SafeBuffer` | Log streaming | Bounded log buffers |

### Medium Priority

| Module | Use Case | Formal Guarantee |
|--------|----------|------------------|
| `SafeGraph` | Container network topology | Valid network connections |
| `SafePolicy` | Security policies | SELinux/AppArmor rules |
| `SafeSchema` | Image manifest validation | OCI spec compliance |

## Integration Points

### 1. Container Lifecycle (SafeResource)

```
:nonexistent → :created → :running → :paused → :stopped → :removed
```

Container state transitions:
- `podman_create`: nonexistent → created
- `podman_start`: created → running
- `podman_pause`: running → paused
- `podman_stop`: running → stopped
- `podman_rm`: stopped → removed

### 2. Linux Capabilities (SafeCapability)

```
SafeCapability.drop CAP_NET_RAW → restricted container
SafeCapability.add CAP_SYS_PTRACE → debugging container
```

Maps Linux capabilities to proven's capability model:
- `CAP_NET_ADMIN` → NetworkCapability
- `CAP_SYS_ADMIN` → AdminCapability (dangerous)
- `CAP_CHOWN` → FileCapability

### 3. Log Buffer Management (SafeBuffer)

```
podman_logs --follow → SafeBuffer.StreamBuffer → bounded stream
nerdctl_logs --tail 100 → SafeBuffer.RingBuffer → fixed-size window
```

Prevents memory exhaustion from high-volume container logs.

## Runtime-Specific Integrations

| Runtime | Priority | Key Module |
|---------|----------|------------|
| Podman | Primary (FOSS-first) | SafeResource |
| nerdctl | Primary (FOSS-first) | SafeResource |
| Docker | Fallback | SafeResource |

## FOSS-First Security

Per polyglot philosophy, prefer rootless runtimes:
- `podman run --userns=keep-id` → user namespace isolation
- `nerdctl run --rootless` → no root daemon

These map to SafeCapability's principle of least privilege.

## Implementation Notes

For container state management:

```
container_command → SafeResource.validateTransition → execute → update_state
```

Invalid transitions (e.g., stop a non-running container) are rejected at the type level.

## Status

- [ ] Add SafeResource bindings for container lifecycle
- [ ] Map Linux capabilities to SafeCapability
- [ ] Integrate SafeBuffer for log streaming
- [ ] Add SafeGraph for compose/pod networking
