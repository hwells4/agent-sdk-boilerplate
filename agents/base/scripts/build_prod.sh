#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${BASE_DIR}/.venv"
REQ_FILE="${BASE_DIR}/requirements.dev.txt"
PYTHON_BIN="${PYTHON:-python3}"

if [ ! -d "$VENV_DIR" ]; then
  echo "[e2b] creating virtualenv in ${VENV_DIR}"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

source "${VENV_DIR}/bin/activate"

echo "[e2b] installing Python requirements"
pip install --upgrade pip >/dev/null
pip install --requirement "$REQ_FILE"

echo "[e2b] building template (prod)"
python "${BASE_DIR}/build_prod.py"
