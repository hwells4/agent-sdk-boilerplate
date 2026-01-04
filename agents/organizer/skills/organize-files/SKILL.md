# Organize Files Skill

Comprehensive file organization workflow that analyzes, proposes, and executes file structure improvements.

## Trigger

This skill is invoked when:
- User runs `/organize` command
- User asks to "organize", "clean up", "structure", or "sort" files
- User wants to "tidy up" a directory

## Arguments

- `path` (optional): Target directory path. Defaults to `/home/user/workspace`
- `strategy` (optional): Organization strategy - `type`, `project`, `date`, or `auto`
- `dry-run` (optional): If true, only show proposed changes without executing

## Workflow

### Step 1: Scan Directory

```bash
# Get directory structure
tree -L 3 --noreport "${path:-/home/user/workspace}"

# Get file type summary
find "${path:-/home/user/workspace}" -type f | sed 's/.*\.//' | sort | uniq -c | sort -rn
```

### Step 2: Analyze Patterns

Examine the scan results and identify:

1. **File Type Distribution**
   - What types of files exist?
   - Are there dominant file types?

2. **Naming Conventions**
   - Are there consistent patterns?
   - Date prefixes? Project prefixes?

3. **Current Organization**
   - Is there existing structure?
   - What is working well?

4. **Problem Areas**
   - Mixed file types in same directory
   - Deep nesting without purpose
   - Orphaned files at root level

### Step 3: Generate Proposal

Based on the strategy (or auto-detected best fit):

#### Strategy: Type
Group files by their extension/type:
- `documents/` - .pdf, .doc, .docx, .txt, .md
- `images/` - .jpg, .jpeg, .png, .gif, .svg
- `code/` - .py, .js, .ts, .go, .rs
- `data/` - .json, .csv, .xml, .yaml
- `archives/` - .zip, .tar, .gz

#### Strategy: Project
Group files by detected project indicators:
- Look for README files, package.json, etc.
- Group related files together
- Maintain internal project structure

#### Strategy: Date
Group files by modification date:
- `YYYY/MM/` structure
- Or `YYYY/QN/` for quarterly grouping

#### Strategy: Auto
Analyze and choose the best strategy based on:
- If strong date patterns exist -> date
- If project indicators exist -> project
- Default -> type

### Step 4: Present Changes

Output format:
```
## Organization Proposal

**Strategy**: [selected strategy]
**Scope**: [number of files/directories affected]

### New Directories to Create
1. `documents/` - for X files
2. `images/` - for Y files

### Files to Move
| From | To | Reason |
|------|-----|--------|
| file1.pdf | documents/file1.pdf | PDF document |
| image.png | images/image.png | Image file |

### Summary
- Files to move: N
- Directories to create: M
- Estimated time: ~X seconds

**Do you approve these changes?** (yes/no)
```

### Step 5: Execute (After Approval)

```bash
# Create directories first
mkdir -p documents images code data

# Move files one by one, reporting progress
mv file1.pdf documents/
echo "Moved file1.pdf -> documents/"

# ... continue for each file

# Clean up empty directories
find . -type d -empty -delete

# Show final structure
tree -L 2
```

### Step 6: Report Results

```
## Organization Complete

- Files moved: N
- Directories created: M
- Empty directories removed: K
- Errors encountered: 0

### New Structure
[tree output]

### Undo Instructions
To reverse these changes, run:
[list of reverse mv commands]
```

## Error Handling

- **File exists at destination**: Prompt user for action (rename, skip, overwrite)
- **Permission denied**: Report and skip, continue with others
- **Path not found**: Verify path and re-prompt

## Examples

### Example 1: Basic Usage
```
User: /organize
Agent: [Scans workspace and proposes organization by type]
```

### Example 2: With Path
```
User: /organize path=/home/user/workspace/downloads
Agent: [Scans downloads directory specifically]
```

### Example 3: Dry Run
```
User: /organize dry-run=true
Agent: [Shows proposal but does not execute]
```

### Example 4: Specific Strategy
```
User: /organize strategy=date
Agent: [Organizes files by modification date]
```

## Tips

- Start with `dry-run=true` to preview changes
- Use `strategy=auto` for intelligent detection
- Large directories may take longer to analyze
- Always review the proposal before approving
