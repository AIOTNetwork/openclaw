#!/usr/bin/env bash
set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the repository root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo -e "${BLUE}OpenClaw Config Setup${NC}"
echo "====================="
echo

# Prompt for config name (used as base name when multi-instance)
read -p "Enter config name: " CONFIG_NAME_BASE

if [[ -z "$CONFIG_NAME_BASE" ]]; then
  echo -e "${RED}Error: Config name cannot be empty${NC}"
  exit 1
fi

# Sanitize config name (remove special characters, spaces)
CONFIG_NAME_BASE=$(echo "$CONFIG_NAME_BASE" | tr -cd '[:alnum:]_-')

# Prompt for instance count
read -p "How many instances to set up? [1]: " INSTANCE_COUNT
INSTANCE_COUNT="${INSTANCE_COUNT:-1}"

if ! [[ "$INSTANCE_COUNT" =~ ^[1-9][0-9]*$ ]]; then
  echo -e "${RED}Error: Instance count must be a positive integer${NC}"
  exit 1
fi

# Prompt for gateway port (starting port when multi-instance)
if [[ "$INSTANCE_COUNT" -gt 1 ]]; then
  read -p "Enter starting gateway port (e.g., 48780): " STARTING_PORT
else
  read -p "Enter gateway port (e.g., 48780): " STARTING_PORT
fi

# Validate port number
if ! [[ "$STARTING_PORT" =~ ^[0-9]+$ ]] || [[ "$STARTING_PORT" -lt 1024 ]] || [[ "$STARTING_PORT" -gt 65535 ]]; then
  echo -e "${RED}Error: Invalid port number. Must be between 1024 and 65535${NC}"
  exit 1
fi

# Validate that all ports fit in valid range when multi-instance
if [[ "$INSTANCE_COUNT" -gt 1 ]]; then
  LAST_GATEWAY_PORT=$((STARTING_PORT + INSTANCE_COUNT - 1))
  LAST_BRIDGE_PORT=$((LAST_GATEWAY_PORT + 100))
  if [[ "$LAST_BRIDGE_PORT" -gt 65535 ]]; then
    echo -e "${RED}Error: Port range exceeds 65535 for $INSTANCE_COUNT instances starting at $STARTING_PORT${NC}"
    exit 1
  fi
fi

# ----------------------------------------------------------
# Multi-instance: collect shared prompts once before the loop
# ----------------------------------------------------------
if [[ "$INSTANCE_COUNT" -gt 1 ]]; then
  echo "Which channel for all instances?"
  echo "  1) Telegram"
  echo "  2) Discord"
  echo "  3) Both"
  read -p "Choose [1/2/3]: " CHANNEL_CHOICE

  case "$CHANNEL_CHOICE" in
    1|2|3) ;;
    *)
      echo -e "${RED}Invalid channel choice.${NC}"
      exit 1
      ;;
  esac
  echo

  DISCORD_USER_IDS_RAW=""
  TELEGRAM_USER_IDS_RAW=""

  if [[ "$CHANNEL_CHOICE" == "2" || "$CHANNEL_CHOICE" == "3" ]]; then
    read -p "Enter Discord user IDs to pre-authorize (comma-separated): " DISCORD_USER_IDS_RAW
    if [[ -z "$DISCORD_USER_IDS_RAW" ]]; then
      echo -e "${RED}Error: At least one Discord user ID is required for multi-instance setup${NC}"
      exit 1
    fi
  fi

  if [[ "$CHANNEL_CHOICE" == "1" || "$CHANNEL_CHOICE" == "3" ]]; then
    read -p "Enter Telegram user IDs to pre-authorize (comma-separated): " TELEGRAM_USER_IDS_RAW
    if [[ -z "$TELEGRAM_USER_IDS_RAW" ]]; then
      echo -e "${RED}Error: At least one Telegram user ID is required for multi-instance setup${NC}"
      exit 1
    fi
  fi
fi

# Check if Docker is running (once, before the loop)
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}Error: Docker is not running. Please start Docker and try again.${NC}"
  exit 1
fi

# Build openclaw:local image if it doesn't exist (once, before the loop)
if ! docker image inspect openclaw:local > /dev/null 2>&1; then
  echo -e "${BLUE}Building openclaw:local Docker image...${NC}"
  if ! docker build -t openclaw:local -f Dockerfile .; then
    echo -e "${RED}Error: Failed to build openclaw:local image${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓${NC} Built openclaw:local image"
  echo
fi

# ============================================================
# Main loop — one iteration per instance
# ============================================================
for INSTANCE_IDX in $(seq 1 "$INSTANCE_COUNT"); do

  # Derive per-instance config name and port
  if [[ "$INSTANCE_COUNT" -eq 1 ]]; then
    CONFIG_NAME="$CONFIG_NAME_BASE"
  else
    CONFIG_NAME="${CONFIG_NAME_BASE}-${INSTANCE_IDX}"
    echo
    echo -e "${YELLOW}=== Setting up instance $INSTANCE_IDX of $INSTANCE_COUNT ===${NC}"
    echo
  fi

  GATEWAY_PORT=$((STARTING_PORT + INSTANCE_IDX - 1))
  BRIDGE_PORT=$((GATEWAY_PORT + 100))

  CONFIG_BASE_DIR="$REPO_ROOT/config/$CONFIG_NAME"

  # ----------------------------------------------------------
  # Directory creation / existing-config menu
  # ----------------------------------------------------------
  if [[ -d "$CONFIG_BASE_DIR" ]]; then
    # In multi-instance mode, skip the interactive menu — just update
    if [[ "$INSTANCE_COUNT" -gt 1 ]]; then
      echo -e "${BLUE}Config directory already exists: $CONFIG_BASE_DIR — updating...${NC}"
    else
      echo -e "${BLUE}Config directory already exists: $CONFIG_BASE_DIR${NC}"
      echo
      echo "What would you like to do?"
      echo "  1) Update existing config (re-enter tokens, keep directory structure)"
      echo "  2) Override config (delete and recreate from scratch)"
      echo "  3) Pair channel device"
      echo
      read -p "Choose an option [1/2/3]: " CONFIG_ACTION

      case "$CONFIG_ACTION" in
        1)
          echo
          echo -e "${BLUE}Updating existing config...${NC}"
          ;;
        2)
          echo
          echo -e "${RED}This will delete all existing config in $CONFIG_BASE_DIR${NC}"
          read -p "Are you sure? [y/N]: " CONFIRM_OVERRIDE
          if [[ "$CONFIRM_OVERRIDE" != "y" && "$CONFIRM_OVERRIDE" != "Y" ]]; then
            echo "Aborted."
            exit 0
          fi
          echo -e "${BLUE}Removing existing config...${NC}"
          rm -rf "$CONFIG_BASE_DIR"
          echo -e "${GREEN}✓${NC} Removed $CONFIG_BASE_DIR"
          echo
          echo -e "${BLUE}Creating directories...${NC}"
          mkdir -p "$CONFIG_BASE_DIR/config"
          mkdir -p "$CONFIG_BASE_DIR/workspace"
          echo -e "${GREEN}✓${NC} Created $CONFIG_BASE_DIR/config/"
          echo -e "${GREEN}✓${NC} Created $CONFIG_BASE_DIR/workspace/"
          echo
          ;;
        3)
          echo
          ENV_FILE="$CONFIG_BASE_DIR/.env"
          DOCKER_PROJECT="openclaw-$CONFIG_NAME"
          DOCKER_CMD="docker compose --env-file $ENV_FILE -p $DOCKER_PROJECT exec"

          echo "Which channel to pair?"
          echo "  1) Telegram"
          echo "  2) Discord"
          read -p "Choose [1/2]: " PAIR_CHANNEL

          case "$PAIR_CHANNEL" in
            1)
              echo -e "${BLUE}Approve Telegram device pairing:${NC}"
              echo "Send /start to your Telegram bot to get a pairing code."
              read -p "Enter the pairing code: " PAIRING_CODE
              if [[ -z "$PAIRING_CODE" ]]; then
                echo -e "${RED}Error: Pairing code cannot be empty${NC}"
                exit 1
              fi
              echo "Approving Telegram pairing..."
              if $DOCKER_CMD openclaw-gateway node dist/index.js pairing approve telegram "$PAIRING_CODE"; then
                echo -e "${GREEN}✓${NC} Telegram bot paired successfully!"
              else
                echo -e "${RED}Error: Failed to approve Telegram pairing${NC}"
                exit 1
              fi
              ;;
            2)
              echo -e "${BLUE}Approve Discord device pairing:${NC}"
              echo "Send a DM to your Discord bot to get a pairing code."
              read -p "Enter the pairing code: " PAIRING_CODE
              if [[ -z "$PAIRING_CODE" ]]; then
                echo -e "${RED}Error: Pairing code cannot be empty${NC}"
                exit 1
              fi
              echo "Approving Discord pairing..."
              if $DOCKER_CMD openclaw-gateway node dist/index.js pairing approve discord "$PAIRING_CODE"; then
                echo -e "${GREEN}✓${NC} Discord bot paired successfully!"
              else
                echo -e "${RED}Error: Failed to approve Discord pairing${NC}"
                exit 1
              fi
              ;;
            *)
              echo -e "${RED}Invalid option.${NC}"
              exit 1
              ;;
          esac

          echo
          echo -e "${GREEN}Done!${NC}"
          exit 0
          ;;
        *)
          echo -e "${RED}Invalid option. Please choose 1, 2, or 3.${NC}"
          exit 1
          ;;
      esac
    fi
  else
    # Create directory structure
    echo -e "${BLUE}Creating directories...${NC}"
    mkdir -p "$CONFIG_BASE_DIR/config"
    mkdir -p "$CONFIG_BASE_DIR/workspace"
    echo -e "${GREEN}✓${NC} Created $CONFIG_BASE_DIR/config/"
    echo -e "${GREEN}✓${NC} Created $CONFIG_BASE_DIR/workspace/"
    echo
  fi

  # Check if ports are available
  if lsof -Pi :"$GATEWAY_PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${RED}Error: Gateway port $GATEWAY_PORT is already in use${NC}"
    exit 1
  fi

  if lsof -Pi :"$BRIDGE_PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${RED}Error: Bridge port $BRIDGE_PORT is already in use${NC}"
    exit 1
  fi

  echo -e "${GREEN}✓${NC} Ports $GATEWAY_PORT and $BRIDGE_PORT are available"
  echo

  # ----------------------------------------------------------
  # Channel selection (per instance for single, pre-set for multi)
  # ----------------------------------------------------------
  if [[ "$INSTANCE_COUNT" -eq 1 ]]; then
    echo "Which channel?"
    echo "  1) Telegram"
    echo "  2) Discord"
    echo "  3) Both"
    read -p "Choose [1/2/3]: " CHANNEL_CHOICE

    case "$CHANNEL_CHOICE" in
      1|2|3) ;;
      *)
        echo -e "${RED}Invalid channel choice.${NC}"
        exit 1
        ;;
    esac
    echo
  fi

  # ----------------------------------------------------------
  # Create .env file
  # ----------------------------------------------------------
  ENV_FILE="$CONFIG_BASE_DIR/.env"
  echo -e "${BLUE}Creating .env file...${NC}"

  # ----------------------------------------------------------
  # Claude Code token (per instance)
  # ----------------------------------------------------------
  read -p "Enter Claude Code token: " CLAUDE_TOKEN

  if [[ -z "$CLAUDE_TOKEN" ]]; then
    echo -e "${RED}Error: Claude Code token cannot be empty${NC}"
    exit 1
  fi

  # Create auth-profiles.json
  echo -e "${BLUE}Creating auth profiles...${NC}"
  AUTH_PROFILES_DIR="$CONFIG_BASE_DIR/config/agents/main/agent"
  mkdir -p "$AUTH_PROFILES_DIR"

  TIMESTAMP=$(( $(date +%s) * 1000 ))

  cat > "$AUTH_PROFILES_DIR/auth-profiles.json" <<EOF
{
  "version": 1,
  "profiles": {
    "anthropic:default": {
      "type": "token",
      "provider": "anthropic",
      "token": "$CLAUDE_TOKEN"
    }
  },
  "lastGood": {
    "anthropic": "anthropic:default"
  },
  "usageStats": {
    "anthropic:default": {
      "lastUsed": $TIMESTAMP,
      "errorCount": 0
    }
  }
}
EOF

  echo -e "${GREEN}✓${NC} Created $AUTH_PROFILES_DIR/auth-profiles.json"
  echo

  # ----------------------------------------------------------
  # Bot token prompts based on channel choice
  # ----------------------------------------------------------
  TG_BOT_TOKEN=""
  DISCORD_BOT_TOKEN=""

  if [[ "$CHANNEL_CHOICE" == "1" || "$CHANNEL_CHOICE" == "3" ]]; then
    read -p "Enter Telegram bot token: " TG_BOT_TOKEN
    if [[ -z "$TG_BOT_TOKEN" ]]; then
      echo -e "${RED}Error: Telegram bot token cannot be empty${NC}"
      exit 1
    fi
  fi

  if [[ "$CHANNEL_CHOICE" == "2" || "$CHANNEL_CHOICE" == "3" ]]; then
    read -p "Enter Discord bot token: " DISCORD_BOT_TOKEN
    if [[ -z "$DISCORD_BOT_TOKEN" ]]; then
      echo -e "${RED}Error: Discord bot token cannot be empty${NC}"
      exit 1
    fi
  fi

  # ----------------------------------------------------------
  # Generate secure gateway auth token
  # ----------------------------------------------------------
  echo -e "${BLUE}Generating secure gateway auth token...${NC}"
  AUTH_TOKEN=$(openssl rand -hex 24)

  if [[ -z "$AUTH_TOKEN" ]]; then
    echo -e "${RED}Error: Failed to generate auth token${NC}"
    exit 1
  fi

  cat > "$ENV_FILE" <<EOF
OPENCLAW_CONFIG_DIR=$CONFIG_BASE_DIR/config/
OPENCLAW_WORKSPACE_DIR=$CONFIG_BASE_DIR/workspace/
OPENCLAW_GATEWAY_PORT=$GATEWAY_PORT
OPENCLAW_BRIDGE_PORT=$BRIDGE_PORT
OPENCLAW_GATEWAY_TOKEN=$AUTH_TOKEN
EOF

  echo -e "${GREEN}✓${NC} Created $ENV_FILE"
  echo

  # ----------------------------------------------------------
  # Build channel/plugin JSON fragments
  # ----------------------------------------------------------
  # DM policy: allowlist for multi-instance (pre-authorized), pairing for single
  if [[ "$INSTANCE_COUNT" -gt 1 ]]; then
    DM_POLICY="allowlist"
  else
    DM_POLICY="pairing"
  fi

  CHANNELS_JSON=""
  PLUGINS_JSON=""

  if [[ "$CHANNEL_CHOICE" == "1" ]]; then
    # Telegram only
    CHANNELS_JSON=$(cat <<CEOF
    "telegram": {
      "enabled": true,
      "dmPolicy": "$DM_POLICY",
      "botToken": "$TG_BOT_TOKEN",
      "groupPolicy": "allowlist",
      "streamMode": "partial"
    }
CEOF
    )
    PLUGINS_JSON=$(cat <<PEOF
      "telegram": {
        "enabled": true
      }
PEOF
    )
  elif [[ "$CHANNEL_CHOICE" == "2" ]]; then
    # Discord only
    CHANNELS_JSON=$(cat <<CEOF
    "discord": {
      "enabled": true,
      "token": "$DISCORD_BOT_TOKEN",
      "dm": { "policy": "$DM_POLICY" }
    }
CEOF
    )
    PLUGINS_JSON=$(cat <<PEOF
      "discord": {
        "enabled": true
      }
PEOF
    )
  else
    # Both
    CHANNELS_JSON=$(cat <<CEOF
    "telegram": {
      "enabled": true,
      "dmPolicy": "$DM_POLICY",
      "botToken": "$TG_BOT_TOKEN",
      "groupPolicy": "allowlist",
      "streamMode": "partial"
    },
    "discord": {
      "enabled": true,
      "token": "$DISCORD_BOT_TOKEN",
      "dm": { "policy": "$DM_POLICY" }
    }
CEOF
    )
    PLUGINS_JSON=$(cat <<PEOF
      "telegram": {
        "enabled": true
      },
      "discord": {
        "enabled": true
      }
PEOF
    )
  fi

  # ----------------------------------------------------------
  # Create openclaw.json config file
  # ----------------------------------------------------------
  echo -e "${BLUE}Creating OpenClaw configuration...${NC}"
  CONFIG_FILE="$CONFIG_BASE_DIR/config/openclaw.json"
  TIMESTAMP_ISO=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

  cat > "$CONFIG_FILE" <<EOF
{
  "meta": {
    "lastTouchedVersion": "2026.2.6",
    "lastTouchedAt": "$TIMESTAMP_ISO"
  },
  "wizard": {
    "lastRunAt": "$TIMESTAMP_ISO",
    "lastRunVersion": "2026.2.6",
    "lastRunCommand": "configure",
    "lastRunMode": "local"
  },
  "auth": {
    "profiles": {
      "anthropic:default": {
        "provider": "anthropic",
        "mode": "token"
      }
    }
  },
  "agents": {
    "defaults": {
      "workspace": "/home/node/.openclaw/workspace",
      "compaction": {
        "mode": "safeguard"
      },
      "maxConcurrent": 4,
      "subagents": {
        "maxConcurrent": 8
      }
    }
  },
  "messages": {
    "ackReactionScope": "group-mentions"
  },
  "commands": {
    "native": "auto",
    "nativeSkills": "auto"
  },
  "channels": {
$CHANNELS_JSON
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "$AUTH_TOKEN"
    },
    "tailscale": {
      "mode": "off",
      "resetOnExit": false
    }
  },
  "plugins": {
    "entries": {
$PLUGINS_JSON
    }
  }
}
EOF

  echo -e "${GREEN}✓${NC} Created $CONFIG_FILE"
  echo

  # ----------------------------------------------------------
  # Pre-create allowFrom files (multi-instance only)
  # ----------------------------------------------------------
  if [[ "$INSTANCE_COUNT" -gt 1 ]]; then
    CREDENTIALS_DIR="$CONFIG_BASE_DIR/config/credentials"
    mkdir -p "$CREDENTIALS_DIR"

    if [[ "$CHANNEL_CHOICE" == "2" || "$CHANNEL_CHOICE" == "3" ]]; then
      # Build JSON array from comma-separated Discord user IDs
      DISCORD_ALLOW_JSON="["
      FIRST=true
      IFS=',' read -ra DISCORD_IDS <<< "$DISCORD_USER_IDS_RAW"
      for uid in "${DISCORD_IDS[@]}"; do
        uid=$(echo "$uid" | xargs) # trim whitespace
        if [[ -n "$uid" ]]; then
          if [[ "$FIRST" == "true" ]]; then
            FIRST=false
          else
            DISCORD_ALLOW_JSON+=","
          fi
          DISCORD_ALLOW_JSON+="\"$uid\""
        fi
      done
      DISCORD_ALLOW_JSON+="]"

      cat > "$CREDENTIALS_DIR/discord-allowFrom.json" <<AFEOF
{
  "version": 1,
  "allowFrom": $DISCORD_ALLOW_JSON
}
AFEOF
      echo -e "${GREEN}✓${NC} Created discord-allowFrom.json with pre-authorized users"
    fi

    if [[ "$CHANNEL_CHOICE" == "1" || "$CHANNEL_CHOICE" == "3" ]]; then
      # Build JSON array from comma-separated Telegram user IDs
      TELEGRAM_ALLOW_JSON="["
      FIRST=true
      IFS=',' read -ra TELEGRAM_IDS <<< "$TELEGRAM_USER_IDS_RAW"
      for uid in "${TELEGRAM_IDS[@]}"; do
        uid=$(echo "$uid" | xargs) # trim whitespace
        if [[ -n "$uid" ]]; then
          if [[ "$FIRST" == "true" ]]; then
            FIRST=false
          else
            TELEGRAM_ALLOW_JSON+=","
          fi
          TELEGRAM_ALLOW_JSON+="\"$uid\""
        fi
      done
      TELEGRAM_ALLOW_JSON+="]"

      cat > "$CREDENTIALS_DIR/telegram-allowFrom.json" <<AFEOF
{
  "version": 1,
  "allowFrom": $TELEGRAM_ALLOW_JSON
}
AFEOF
      echo -e "${GREEN}✓${NC} Created telegram-allowFrom.json with pre-authorized users"
    fi
    echo
  fi

  # ----------------------------------------------------------
  # Launch Docker Compose
  # ----------------------------------------------------------
  echo -e "${BLUE}Starting Docker containers...${NC}"

  DOCKER_PROJECT="openclaw-$CONFIG_NAME"

  if ! docker compose --env-file "$ENV_FILE" -p "$DOCKER_PROJECT" up -d; then
    echo -e "${RED}Error: Failed to start Docker containers${NC}"
    echo "Check Docker logs for more details:"
    echo -e "  ${BLUE}docker compose -p $DOCKER_PROJECT logs${NC}"
    exit 1
  fi

  echo -e "${GREEN}✓${NC} Docker containers started successfully"
  echo

  echo "Configuration details:"
  echo "  Config name:        $CONFIG_NAME"
  echo "  Base directory:     $CONFIG_BASE_DIR"
  echo "  Gateway port:       $GATEWAY_PORT"
  echo "  Bridge port:        $BRIDGE_PORT"
  echo "  Gateway auth token: $AUTH_TOKEN"
  echo "  Docker project:     $DOCKER_PROJECT"
  echo

  # ----------------------------------------------------------
  # Device Pairing Flow
  # ----------------------------------------------------------
  DOCKER_CMD="docker compose --env-file $ENV_FILE -p $DOCKER_PROJECT exec"

  if [[ "$INSTANCE_COUNT" -eq 1 ]]; then
    # --- Single-instance: interactive device pairing ---
    echo -e "${BLUE}Device Pairing Instructions:${NC}"
    echo -e "1. Your Gateway Token: ${GREEN}$AUTH_TOKEN${NC}"
    echo "2. Opening gateway overview page in your browser..."
    echo "3. On the page, paste the token above as 'Gateway Token' and tap 'Connect'"
    echo

    # Open browser
    if open "http://127.0.0.1:$GATEWAY_PORT/overview" 2>/dev/null; then
      sleep 1
    else
      echo "Please open: http://127.0.0.1:$GATEWAY_PORT/overview"
    fi

    # Poll for device pairing requests
    echo "Waiting for device pairing request..."
    PENDING_FILE="$CONFIG_BASE_DIR/config/devices/pending.json"
    REQUEST_ID=""

    while [ -z "$REQUEST_ID" ]; do
      sleep 2

      if [ -f "$PENDING_FILE" ] && [ -s "$PENDING_FILE" ]; then
        REQUEST_ID=$(grep -Eo '"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"' "$PENDING_FILE" | head -1 | tr -d '"')

        if [ -n "$REQUEST_ID" ]; then
          echo -e "${GREEN}✓${NC} Device pairing request received: $REQUEST_ID"
        fi
      else
        echo -n "."
      fi
    done

    echo

    # Auto-approve the device
    echo "Approving device pairing request..."
    if $DOCKER_CMD openclaw-gateway node dist/index.js devices approve "$REQUEST_ID"; then
      echo -e "${GREEN}✓${NC} Device paired successfully!"
    else
      echo -e "${RED}Error: Failed to approve device${NC}"
      exit 1
    fi

    # ----------------------------------------------------------
    # Channel Pairing Flow (single-instance only)
    # ----------------------------------------------------------
    echo

    # Telegram pairing
    if [[ "$CHANNEL_CHOICE" == "1" || "$CHANNEL_CHOICE" == "3" ]]; then
      echo -e "${BLUE}Telegram Bot Pairing:${NC}"
      echo "1. Open Telegram and find your bot"
      echo "2. Send /start to the bot"
      echo "3. You will receive a pairing code"
      echo

      read -p "Enter the pairing code from Telegram: " TG_PAIRING_CODE

      if [[ -z "$TG_PAIRING_CODE" ]]; then
        echo -e "${RED}Error: Pairing code cannot be empty${NC}"
        exit 1
      fi

      echo "Approving Telegram pairing..."
      if $DOCKER_CMD openclaw-gateway node dist/index.js pairing approve telegram "$TG_PAIRING_CODE"; then
        echo -e "${GREEN}✓${NC} Telegram bot paired successfully!"
      else
        echo -e "${RED}Error: Failed to approve Telegram pairing${NC}"
        exit 1
      fi
      echo
    fi

    # Discord pairing
    if [[ "$CHANNEL_CHOICE" == "2" || "$CHANNEL_CHOICE" == "3" ]]; then
      echo -e "${BLUE}Discord Bot Pairing:${NC}"
      echo "1. Open Discord and find your bot"
      echo "2. Send a DM to the bot"
      echo "3. You will receive a pairing code"
      echo

      read -p "Enter the pairing code from Discord: " DISCORD_PAIRING_CODE

      if [[ -z "$DISCORD_PAIRING_CODE" ]]; then
        echo -e "${RED}Error: Pairing code cannot be empty${NC}"
        exit 1
      fi

      echo "Approving Discord pairing..."
      if $DOCKER_CMD openclaw-gateway node dist/index.js pairing approve discord "$DISCORD_PAIRING_CODE"; then
        echo -e "${GREEN}✓${NC} Discord bot paired successfully!"
      else
        echo -e "${RED}Error: Failed to approve Discord pairing${NC}"
        exit 1
      fi
      echo
    fi
  else
    # --- Multi-instance: automatic device pairing via localhost ---
    echo -e "${BLUE}Auto-pairing device for instance $INSTANCE_IDX...${NC}"

    # Write a temporary Node.js script to the config dir (mounted inside container)
    AUTO_PAIR_SCRIPT="$CONFIG_BASE_DIR/config/.auto-pair.js"
    cat > "$AUTO_PAIR_SCRIPT" << 'APEOF'
const crypto = require("crypto");
const WebSocket = require("ws");
const AUTH_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;

// Generate Ed25519 key pair for device identity
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const spki = publicKey.export({ type: "spki", format: "der" });
const PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const rawKey = spki.subarray(PREFIX.length);
const deviceId = crypto.createHash("sha256").update(rawKey).digest("hex");

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
const publicKeyB64 = b64url(rawKey);
const signedAt = Date.now();

// Build v1 auth payload (no nonce needed for localhost)
const payload = ["v1", deviceId, "cli", "cli", "operator", "operator.admin", String(signedAt), AUTH_TOKEN].join("|");
const signature = b64url(crypto.sign(null, Buffer.from(payload, "utf8"), privateKey));

let attempts = 0;
function tryConnect() {
  attempts++;
  const ws = new WebSocket("ws://127.0.0.1:18789");
  const timeout = setTimeout(() => { try { ws.close(); } catch {} }, 10000);

  ws.on("open", () => {
    ws.send(JSON.stringify({
      type: "req",
      id: "1",
      method: "connect",
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: { id: "cli", version: "1.0.0", platform: "linux", mode: "cli" },
        role: "operator",
        device: { id: deviceId, publicKey: publicKeyB64, signature, signedAt },
        auth: { token: AUTH_TOKEN },
      },
    }));
  });

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === "res" && msg.ok) {
      clearTimeout(timeout);
      console.log("ok");
      ws.close();
      process.exit(0);
    } else if (msg.type === "res" && !msg.ok) {
      clearTimeout(timeout);
      console.error("error:" + JSON.stringify(msg.error));
      ws.close();
      process.exit(1);
    }
  });

  ws.on("error", () => {
    clearTimeout(timeout);
    if (attempts < 15) {
      setTimeout(tryConnect, 2000);
    } else {
      console.error("error:timeout");
      process.exit(1);
    }
  });
}
tryConnect();
APEOF

    # Run the auto-pair script inside the gateway container (localhost → silent auto-approve)
    if $DOCKER_CMD openclaw-gateway node /home/node/.openclaw/.auto-pair.js; then
      echo -e "${GREEN}✓${NC} Device auto-paired for instance $INSTANCE_IDX"
    else
      echo -e "${RED}Error: Failed to auto-pair device for instance $INSTANCE_IDX${NC}"
      echo "You can manually pair later using: docker compose -p $DOCKER_PROJECT exec openclaw-gateway node dist/index.js devices list"
    fi

    # Clean up temp script
    rm -f "$AUTO_PAIR_SCRIPT"
    echo
  fi

  echo -e "${GREEN}Instance '$CONFIG_NAME' setup complete!${NC}"
  echo
  echo "To view logs:"
  echo -e "  ${BLUE}docker compose -p $DOCKER_PROJECT logs -f${NC}"
  echo
  echo "To stop containers:"
  echo -e "  ${BLUE}docker compose -p $DOCKER_PROJECT down${NC}"

done

echo
echo -e "${GREEN}All $INSTANCE_COUNT instance(s) set up successfully!${NC}"
