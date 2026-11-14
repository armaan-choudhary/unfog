#!/usr/bin/env bash
# ==============================================================================
# Unfog — Start Script
# Runs the Unfog AI Codebase Trace & Comprehension Engine against a session.
# ==============================================================================

set -eo pipefail

INITIAL_PWD="$PWD"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for terminal output
BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
YELLOW="\033[33m"
MAGENTA="\033[35m"
RED="\033[31m"
RESET="\033[0m"

# Default configuration
PORT=3001
VITE_PORT=5173
DEV_MODE=false
FORCE_BUILD=false
NO_BROWSER=false
USER_SPECIFIED_PORT=false
TARGET_PATH=""

# Help message
show_help() {
  echo -e "${BOLD}Unfog — Start Script${RESET}

${BOLD}USAGE:${RESET}
  ./run.sh [OPTIONS] [TARGET_PATH]

${BOLD}ARGUMENTS:${RESET}
  TARGET_PATH             Path to the repository/codebase to analyze 
                          (default: ${CYAN}tests/fixtures/sample-app${RESET})

${BOLD}OPTIONS:${RESET}
  -d, --dev               Development mode: runs Rust backend on :3001 and 
                          Vite HMR dev server on :5173
  -b, --build             Force rebuild frontend assets before running
  -p, --port <PORT>       Port for backend daemon (default: 3001)
      --no-browser        Do not automatically open the browser
  -h, --help              Show this help message

${BOLD}EXAMPLES:${RESET}
  ./run.sh                                    # Run against default sample app
  ./run.sh /path/to/my-nextjs-app             # Run against custom codebase
  ./run.sh --dev                              # Run in fullstack dev mode with HMR
  ./run.sh --port 8080 tests/fixtures/sample-app"
}

# Parse CLI arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      show_help
      exit 0
      ;;
    -d|--dev)
      DEV_MODE=true
      shift
      ;;
    -b|--build)
      FORCE_BUILD=true
      shift
      ;;
    -p|--port)
      PORT="$2"
      USER_SPECIFIED_PORT=true
      shift 2
      ;;
    --no-browser)
      NO_BROWSER=true
      shift
      ;;
    -*)
      echo -e "${RED}Unknown option: $1${RESET}"
      show_help
      exit 1
      ;;
    *)
      TARGET_PATH="$1"
      shift
      ;;
  esac
done

# Resolve TARGET_PATH relative to where command was called or script directory
if [[ -z "$TARGET_PATH" ]]; then
  TARGET_PATH="$SCRIPT_DIR/tests/fixtures/sample-app"
elif [[ "$TARGET_PATH" != /* ]]; then
  if [[ -d "$INITIAL_PWD/$TARGET_PATH" ]]; then
    TARGET_PATH="$INITIAL_PWD/$TARGET_PATH"
  elif [[ -d "$SCRIPT_DIR/$TARGET_PATH" ]]; then
    TARGET_PATH="$SCRIPT_DIR/$TARGET_PATH"
  else
    echo -e "${YELLOW}Warning: Target directory '${TARGET_PATH}' does not exist.${RESET}"
    TARGET_PATH="$INITIAL_PWD"
  fi
fi

cd "$SCRIPT_DIR"

# Resolve Cargo runner command
run_cargo() {
  if command -v cargo >/dev/null 2>&1; then
    cargo "$@"
  elif command -v mise >/dev/null 2>&1; then
    mise exec -- cargo "$@"
  elif [ -f "$HOME/.cargo/bin/cargo" ]; then
    "$HOME/.cargo/bin/cargo" "$@"
  else
    echo -e "${RED}Error: Cargo is not found in PATH or via mise.${RESET}"
    exit 1
  fi
}

# Resolve npm runner command
run_npm() {
  if command -v npm >/dev/null 2>&1; then
    npm "$@"
  elif command -v mise >/dev/null 2>&1; then
    mise exec -- npm "$@"
  else
    echo -e "${RED}Error: npm is not found in PATH or via mise.${RESET}"
    exit 1
  fi
}

# Check if a port is in use
is_port_in_use() {
  local p="$1"
  (echo > "/dev/tcp/127.0.0.1/$p") 2>/dev/null
}

# Port conflict resolution
if is_port_in_use "$PORT"; then
  if [[ "$USER_SPECIFIED_PORT" == true ]]; then
    echo -e "${RED}Error: Specified port ${PORT} is already in use by another process.${RESET}"
    exit 1
  else
    echo -e "${YELLOW}Notice: Default port ${PORT} is in use.${RESET}"
    while is_port_in_use "$PORT"; do
      PORT=$((PORT + 1))
    done
    echo -e "${CYAN}Automatically using open port ${PORT}.${RESET}"
  fi
fi

# Print banner
echo -e "${CYAN}${BOLD}"
echo "  ██╗   ██╗███╗   ██╗███████╗ ██████╗  ██████╗ "
echo "  ██║   ██║████╗  ██║██╔════╝██╔═══██╗██╔════╝ "
echo "  ██║   ██║██╔██╗ ██║█████╗  ██║   ██║██║  ███╗"
echo "  ██║   ██║██║╚██╗██║██╔══╝  ██║   ██║██║   ██║"
echo "  ╚██████╔╝██║ ╚████║██║     ╚██████╔╝╚██████╔╝"
echo "   ╚═════╝ ╚═╝  ╚═══╝╚═╝      ╚═════╝  ╚═════╝ "
echo -e "${RESET}"
echo -e "${BOLD}Target Codebase:${RESET} ${GREEN}${TARGET_PATH}${RESET}"
echo -e "${BOLD}Backend Port:${RESET}    ${CYAN}${PORT}${RESET}"

# Ensure web/node_modules exists
if [[ ! -d "web/node_modules" ]]; then
  echo -e "\n${BOLD}${CYAN}Installing web dependencies...${RESET}"
  (cd web && run_npm install)
fi

# Build frontend if dist missing or force build requested
if [[ "$FORCE_BUILD" == true || (! -d "web/dist" && "$DEV_MODE" == false) ]]; then
  echo -e "\n${BOLD}${MAGENTA}Building frontend assets (web/dist)...${RESET}"
  (cd web && run_npm run build)
fi

# Helper to launch browser if graphical environment is available
try_open_browser() {
  local url="$1"
  if [[ "$NO_BROWSER" == false && ( -n "$DISPLAY" || -n "$WAYLAND_DISPLAY" || "$(uname)" == "Darwin" ) ]]; then
    (
      sleep 1.2
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$url" >/dev/null 2>&1 || true
      elif command -v open >/dev/null 2>&1; then
        open "$url" >/dev/null 2>&1 || true
      fi
    ) &
  fi
}

if [[ "$DEV_MODE" == true ]]; then
  # --------------------------------------------------------------------------
  # Development Mode: Backend Daemon (:3001) + Vite Dev Server (:5173) with HMR
  # --------------------------------------------------------------------------
  echo -e "${BOLD}Mode:${RESET}            ${YELLOW}Fullstack Dev (Vite HMR on :${VITE_PORT})${RESET}\n"

  # Find open port for Vite if default is busy
  while is_port_in_use "$VITE_PORT"; do
    VITE_PORT=$((VITE_PORT + 1))
  done

  BACKEND_PID=""
  FRONTEND_PID=""

  cleanup_dev() {
    trap - SIGINT SIGTERM
    echo -e "\n${YELLOW}Shutting down Unfog dev processes...${RESET}"
    if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
      kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
      kill "$BACKEND_PID" 2>/dev/null || true
    fi
    exit 0
  }
  trap cleanup_dev SIGINT SIGTERM

  echo -e "${CYAN}Starting Rust backend server on :${PORT}...${RESET}"
  run_cargo run -q -p unfog-cli -- --no-browser --port "$PORT" "$TARGET_PATH" &
  BACKEND_PID=$!

  # Wait for backend health check
  for i in {1..40}; do
    if curl -s "http://127.0.0.1:${PORT}/api/health" 2>/dev/null | grep -q '"status":"ok"'; then
      break
    fi
    sleep 0.2
  done

  echo -e "\n${GREEN}${BOLD}====================================================${RESET}"
  echo -e "${BOLD} Unfog Dashboard:${RESET} ${CYAN}${BOLD}http://localhost:${VITE_PORT}${RESET}"
  echo -e "${BOLD} Backend API:${RESET}     ${CYAN}http://localhost:${PORT}/api${RESET}"
  echo -e "${GREEN}${BOLD}====================================================${RESET}\n"

  try_open_browser "http://localhost:${VITE_PORT}"

  echo -e "${MAGENTA}Starting Vite development server on port ${VITE_PORT}...${RESET}"
  export VITE_BACKEND_PORT="$PORT"
  (cd web && run_npm run dev -- --port "$VITE_PORT") &
  FRONTEND_PID=$!

  wait "$FRONTEND_PID" "$BACKEND_PID"

else
  # --------------------------------------------------------------------------
  # Standalone Mode: Single Server serving both API and Frontend (:3001)
  # --------------------------------------------------------------------------
  echo -e "${BOLD}Mode:${RESET}            ${GREEN}Production Standalone${RESET}\n"
  echo -e "${GREEN}${BOLD}====================================================${RESET}"
  echo -e "${BOLD} Unfog Dashboard:${RESET} ${CYAN}${BOLD}http://localhost:${PORT}${RESET}"
  echo -e "${BOLD} Backend API:${RESET}     ${CYAN}http://localhost:${PORT}/api${RESET}"
  echo -e "${GREEN}${BOLD}====================================================${RESET}\n"

  CLI_ARGS=(--port "$PORT")
  if [[ "$NO_BROWSER" == true ]]; then
    CLI_ARGS+=(--no-browser)
  fi

  # Run backend directly in foreground
  run_cargo run -q -p unfog-cli -- "${CLI_ARGS[@]}" "$TARGET_PATH"
fi
