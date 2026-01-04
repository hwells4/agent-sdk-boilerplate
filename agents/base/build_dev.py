import os
from pathlib import Path
from dotenv import load_dotenv
from e2b import Template, default_build_logger
from template import template

# Load environment variables from .env file
env_path = Path(__file__).parent.parent.parent / '.env'
load_dotenv(env_path)

if __name__ == "__main__":
    Template.build(
        template,
        alias="claude-agent-sandbox-dev",
        on_build_logs=default_build_logger(),
    )