# Lakitu Agent Tool Guide

This document explains how tools work in the Lakitu agent runtime. Read this to understand what tools are available and how to use them.

## Execution Environments

The agent has access to three execution environments:

### 1. Bash Shell (`bash` tool)
**Use for:** Running commands, scripts, file operations, PDF generation

```bash
# Run any shell command
bash: ls -la /home/user/workspace

# Generate a PDF (preferred method)
bash: echo "# My Report\n\nContent here" | generate-pdf "report-name" "Report Title"
```

### 2. Built-in Tools (Direct tool calls)
**Use for:** File operations, artifact management, task tracking

- `file_read`, `file_write`, `file_edit` - File operations
- `artifact_save` - Save text/markdown artifacts (NOT PDFs)
- `beads_create`, `beads_update`, `beads_close` - Task tracking

### 3. Convex Actions (Internal)
**Use for:** Cloud sync, database operations (handled automatically)

---

## PDF Generation

**Always use the bash command for PDFs:**

```bash
echo "# Document Title

## Section 1
Content for section 1...

## Section 2
Content for section 2..." | generate-pdf "filename" "Optional Title"
```

**Parameters:**
- First argument: filename (without .pdf extension)
- Second argument (optional): Document title

**Output:**
- PDF saved to `/home/user/artifacts/filename.pdf`
- Automatically synced to cloud as artifact

**DO NOT use `artifact_save` with type "pdf"** - it cannot create real PDFs.

---

## Artifact Management

### Saving Text Artifacts
```
artifact_save:
  name: "My Document.md"
  content: "# Markdown content here"
  type: "text/markdown"
```

Supported types: `text/markdown`, `json`, `csv`, `text/plain`

### Reading Artifacts
```
artifact_read:
  name: "My Document.md"
```

---

## File Operations

### Reading Files
```
file_read:
  path: "/home/user/workspace/file.txt"
```

### Writing Files
```
file_write:
  path: "/home/user/workspace/output.txt"
  content: "File content"
```

### Editing Files
```
file_edit:
  path: "/home/user/workspace/file.txt"
  old_string: "text to replace"
  new_string: "replacement text"
```

---

## Task Tracking (Beads)

### Create a Task
```
beads_create:
  title: "Implement feature X"
  type: "task"  # task, bug, feature
  priority: 2   # 0=critical, 4=backlog
```

### Update Status
```
beads_update:
  id: "beads-abc123"
  status: "in_progress"  # pending, in_progress, blocked, done
```

### Close Task
```
beads_close:
  id: "beads-abc123"
  reason: "Completed successfully"
```

---

## Working Directory

- **Workspace:** `/home/user/workspace` - For code and working files
- **Artifacts:** `/home/user/artifacts` - For persistent outputs

---

## Best Practices

1. **PDFs:** Always use `generate-pdf` bash command
2. **Text artifacts:** Use `artifact_save`
3. **Verify outputs:** Check that files/artifacts were created
4. **Track work:** Use beads for multi-step tasks
5. **Read before edit:** Always read files before modifying them
