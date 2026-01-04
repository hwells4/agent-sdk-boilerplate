# Create Agent Workflow

<required_reading>
Load references as needed based on context:
- `references/agent-architecture.md` - Always load first
- `references/permission-patterns.md` - If security/permissions mentioned
- `references/mcp-servers.md` - If specific integrations mentioned
- `references/base-images.md` - If environment/dependencies mentioned
</required_reading>

<process>
## Adaptive Interview Process

**Philosophy:** Infer aggressively, ask minimally. Only ask questions when the answer materially affects the agent's viability or when multiple equally valid approaches exist.

### Phase 1: Understand Intent

**What I need to know:**
- Agent's primary purpose (what problem does it solve?)
- Input/output expectations (what goes in, what comes out?)
- Critical constraints (security, performance, specific tools required)

**How I get this information:**
1. **First, analyze what the user already provided** in their request
2. **Infer from context:**
   - "Analyze CSV files" → needs file I/O, probably pandas
   - "Web research" → needs WebSearch/WebFetch
   - "Code review" → needs git access, file operations
   - "Deploy services" → needs elevated permissions, docker/kubernetes tools
3. **Ask targeted questions only if:**
   - Purpose is completely unclear ("create an agent" with no context)
   - Critical security decision (elevated vs restricted permissions)
   - Multiple valid technical approaches (which database? which LLM provider?)

**Examples of good inference:**
```
User: "Create an agent that analyzes CSV files"
→ Infer: Needs pandas, file read, standard permissions, code-interpreter base
→ Don't ask: "Do you want to read files?" (obviously yes)
→ Don't ask: "Which base image?" (code-interpreter is clearly appropriate)
```

```
User: "Create an agent that deploys to Kubernetes"
→ Infer: Needs kubectl, elevated permissions, docker, code-interpreter base
→ Ask: "Will this agent need cluster admin access, or can it use a service account with limited permissions?"
→ Reason: Critical security decision that affects generated RBAC config
```

### Phase 2: Design Agent Architecture

Based on understanding from Phase 1, design the agent:

**Agent naming:**
- Derive from purpose: "CSV analyzer" → `csv-analyzer`
- Use kebab-case
- Be specific: `data-analyzer` is vague, `csv-report-generator` is clear

**Base image selection:**
- `e2bdev/code-interpreter`: Default for most use cases (Python, Node, data tools)
- `e2bdev/desktop`: Only if GUI/browser automation explicitly needed
- Custom: Only if user specified or very unusual requirements

**Dependencies inference:**
```python
# Pattern matching for common needs:
"CSV" or "Excel" → pandas, openpyxl
"API" → httpx, requests
"database" → appropriate client library
"machine learning" → scikit-learn, numpy
"web scraping" → beautifulsoup4, selenium
"testing" → pytest
"git" → git CLI (apt package)
```

**Permission level:**
- **Restricted**: Read-only files, safe commands only → Use for audit/analysis agents
- **Standard** (default): Read/write files, common dev tools → Use for most agents
- **Elevated**: Full access, dangerous commands allowed → Only when explicitly needed

**MCP servers:**
- Infer from purpose:
  - File operations mentioned → Filesystem MCP (optional, often not needed)
  - "Remember" or "persistent" → Memory MCP
  - Browser automation → Browser MCP
  - Database access → Database MCP (configure with connection string)
- Default to none unless clearly beneficial

### Phase 3: Generate Configuration Files

Load all templates from `templates/` and customize:

**For each file:**
1. Read the template
2. Replace placeholders with inferred/gathered values
3. Apply best practices from references
4. Write to `agents/{agent_name}/`

**Critical customizations:**

**template.py:**
- Set base image
- Install system dependencies (apt packages)
- Install Python packages
- Install Node packages if needed
- Copy agent configuration files into sandbox

**CLAUDE.md:**
- Clear agent identity and purpose
- Specific capabilities list (what can it do?)
- Workflow description (how does it operate?)
- Safety rules (what it must NOT do)
- Examples of typical tasks

**settings.json:**
- Permissions based on inferred level
- MCP server configurations (only include what's needed)
- Tool allowlists/denylists
- Dangerous command denials

**Example usage (run_agent.py):**
- Demonstrate the agent's primary use case
- Include realistic example inputs
- Show expected output
- Handle errors gracefully

### Phase 4: Generate and Confirm

**Before writing files:**
1. Show the user a concise summary:
   ```
   ## Agent: {name}

   **Purpose:** {one-line description}
   **Base:** {base-image}
   **Permissions:** {level}
   **Dependencies:** {key packages}
   **MCP Servers:** {list or "None"}

   I'll generate {N} files in agents/{name}/
   ```

2. **Only ask for confirmation if:**
   - Elevated permissions inferred (security risk)
   - Custom base image or unusual setup
   - User might want to see the plan first

3. **Otherwise, just generate** and inform them after:
   ```
   Created agents/{name}/ with {N} files.

   Next steps:
   1. Review CLAUDE.md to customize agent behavior
   2. Run: cd agents/{name} && make e2b:build:dev
   3. Test: python examples/run_{name}.py
   ```

### Phase 5: Offer Immediate Testing

After generation:
```
Would you like me to:
1. Build the template now (requires E2B_API_KEY)
2. Test the agent with an example task
3. Add skills or hooks
4. Customize configuration further
5. Done - I'll test it myself
```

**If user selects 1 (Build):**
- Check for E2B_API_KEY environment variable
- Run `cd agents/{name} && python build_dev.py`
- Capture template ID
- Show next steps with template ID

**If user selects 2 (Test):**
- Ask for example task or suggest one based on purpose
- Run the example script
- Show output and iterate if needed

**If user selects 3 (Add components):**
- Route to `workflows/add-component.md`

**If user selects 4 (Customize):**
- Ask what they want to change
- Edit relevant files
- Offer to rebuild

**If user selects 5 (Done):**
- Provide final summary with docs links
- End workflow

</process>

<decision_trees>
## When to Ask vs. Infer

**ASK when:**
- Purpose is completely unclear
- Critical security decision (admin access, credential handling)
- Multiple equally valid approaches (PostgreSQL vs MySQL)
- User explicitly wants to choose (they asked for options)
- Resource constraints matter (large datasets, high CPU needs)

**INFER when:**
- Purpose clearly implies tools ("CSV" → pandas)
- Standard security model applies (most agents don't need elevated)
- One obvious choice (code-interpreter for Python work)
- Best practice exists (deny dangerous commands by default)
- User provided enough context already

**CONFIRM when:**
- Elevated permissions inferred
- Unusual or complex setup
- User is new to E2B agents (first time)
- Critical data or production deployment mentioned

**JUST DO IT when:**
- Standard setup (code-interpreter, standard permissions)
- User provided clear intent
- Safe defaults apply
- Easy to change later (they can edit CLAUDE.md)
</decision_trees>

<agent_naming_conventions>
## How to Name Agents

**Pattern:** `{domain}-{function}`

**Good names:**
- `csv-analyzer` - Clear and specific
- `web-researcher` - Describes what it does
- `k8s-deployer` - Domain-specific, action-oriented
- `code-reviewer` - Clear purpose

**Bad names:**
- `agent1` - Not descriptive
- `data-processor` - Too vague
- `my-agent` - Not reusable
- `CSV_Analyzer` - Wrong case

**Derive from user intent:**
```
"analyze CSV files" → csv-analyzer
"research companies" → company-researcher
"review pull requests" → pr-reviewer
"deploy to production" → production-deployer
```
</agent_naming_conventions>

<example_flows>
## Example Adaptive Interviews

### Example 1: Clear Intent
```
User: "Create an agent that analyzes CSV files and generates summary reports"

Agent: *Immediately infers:*
- Name: csv-report-generator
- Base: e2bdev/code-interpreter
- Dependencies: pandas, numpy, matplotlib (for charts)
- Permissions: Standard (read/write files)
- MCP: None needed

Agent: "I'll create csv-report-generator with pandas for analysis and matplotlib for visualizations."

*Generates all files*

Agent: "Created agents/csv-report-generator/ with 9 files.

Next: cd agents/csv-report-generator && make e2b:build:dev

Would you like me to build the template now?"
```

### Example 2: Security-Critical Decision
```
User: "Create an agent that deploys Docker containers to production Kubernetes clusters"

Agent: *Infers:*
- Name: k8s-production-deployer
- Base: e2bdev/code-interpreter
- Dependencies: kubectl, docker, kubernetes Python client
- NEEDS DECISION: Permission level (critical security decision)

Agent: "I'll create k8s-production-deployer with kubectl and Docker.

For production deployments, I need to know: Should this agent have cluster admin access, or would you prefer a service account with limited permissions (recommended)?

1. Cluster admin (can deploy anything, higher risk)
2. Limited service account (you'll provide RBAC config)
3. Namespace-scoped only"

*User chooses option 2*

Agent: "Perfect. I'll configure the agent to use kubectl with a service account. You'll need to provide KUBECONFIG or service account credentials when running the agent."

*Generates files with appropriate permissions and documentation*
```

### Example 3: Vague Intent
```
User: "Create an agent"

Agent: "I'd be happy to help! What should this agent do? For example:
- Analyze data files
- Research topics on the web
- Review code or pull requests
- Deploy or manage infrastructure
- Something else?"

*User responds: "I want it to help me organize my files"*

Agent: *Now has enough context:*
- Name: file-organizer
- Base: e2bdev/code-interpreter
- Dependencies: None (uses built-in tools)
- Permissions: Standard
- MCP: Filesystem MCP for enhanced operations

Agent: "I'll create file-organizer that can scan directories, categorize files, and suggest organization strategies."

*Generates files*
```

### Example 4: Multiple Valid Approaches
```
User: "Create an agent that stores data persistently between sessions"

Agent: *Infers most things but needs to know storage approach:*

Agent: "I'll create a persistent data agent. For storage, which approach fits your use case?

1. In-memory (Memory MCP) - Fast, simple key-value storage
2. File-based (JSON/SQLite) - Structured data with queries
3. External database (PostgreSQL/Redis) - Production scale

What kind of data will you be storing?"

*User chooses option 1*

Agent: "Memory MCP it is. I'll configure the agent with persistent key-value storage."

*Generates with Memory MCP configured*
```
</example_flows>

<success_criteria>
Workflow succeeds when:
- User's intent is clearly understood (inferred or clarified)
- All files generated without errors
- Agent configuration matches stated purpose
- Permissions are appropriate (not over-permissioned)
- README and examples are clear and actionable
- User knows exactly what to do next (build, test, customize)
- Build succeeds on first try (or fails with clear error message)
</success_criteria>