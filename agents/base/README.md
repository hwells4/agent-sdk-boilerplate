# Base Agent Template

E2B sandbox template with Claude Agent SDK pre-installed.

## What's Included

- Claude Code CLI
- Claude Agent SDK (Python)
- ripgrep (for fast file search)
- Standard dev tools (git, curl)

## Building

From the project root:

```bash
npm run build:template
```

Or manually:

```bash
cd agents/base
./scripts/build_dev.sh  # creates agents/base/.venv on first run
```

The build outputs a template ID. Add it to your `.env`:

```
E2B_TEMPLATE_ID=the-template-id
```

## Files

| File | Purpose |
|------|---------|
| `template.py` | Template definition (what to install) |
| `build_dev.py` | Build for development |
| `build_prod.py` | Build for production |
| `Dockerfile` | Container definition |
| `e2b.toml` | E2B configuration |

## Customizing

Edit `template.py` to add more dependencies:

```python
template = (
    Template()
    .from_image("e2bdev/code-interpreter")
    .run_cmd("pip install your-package")
)
```

Then rebuild with `./scripts/build_dev.sh`.
