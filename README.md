# SkyVoice

**Voice Concierge for Autonomous Web Interactions**

SkyVoice is a state-of-the-art AI concierge that transforms complex, dynamic web applications into intuitive, voice-driven experiences. Built on the Amazon Nova ecosystem, SkyVoice bridges the accessibility gap by translating intricate UI components—from interactive data tables to visual workflows—into natural conversation and autonomous browser actions.

---

## Core Features

- **Intelligent Structured Extraction**: Our Speak Then Act pipeline parses complex utterances into actionable dimensions for any web-based workflow.
- **Hands-Free Autonomy**: Integrated Nova Act browsing layer that executes universal browser-level interactions (clicking, searching, filtering, and data entry) precisely based on voice intent.
- **Low-Latency Neural Audio**: Powered by Nova Sonic TTS, delivering high-fidelity, human-like voice responses with sub-second response times.
- **Smart Turn-Taking**: Backend-integrated Voice Activity Detection (VAD) layer that understands natural pauses, allowing for a fluid, hands-free conversational flow.
- **Persistent Memory**: Full session persistence via Supabase, ensuring user preferences and conversation histories are preserved across sessions.

---

## Tech Stack

- **AI Orchestration**: Amazon Nova (Nova 2 Sonic for multimodal reasoning, Nova Act for autonomous execution)
- **Real-time Communication**: AWS Bedrock Bidirectional Streaming, Socket.io
- **Cloud Infrastructure**: AWS Bedrock, AWS ECS/Fargate, Docker
- **Backend Architecture**: Node.js, Express, TypeScript, Python
- **Experience Layer**: React, Vite, Tailwind CSS (Chrome Extension Side Panel)
- **Data Persistence**: Supabase (PostgreSQL)

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Chrome Extension                    │
│              (React + Vite Side Panel)                │
│                                                      │
│   Mic Capture ──► AudioWorklet (16kHz PCM) ──► WS    │
│   TTS Playback ◄── AudioWorklet (24kHz) ◄──── WS     │
└──────────────────┬───────────────────────────────────┘
                   │ Socket.io (WebSocket)
                   ▼
┌──────────────────────────────────────────────────────┐
│              Node.js Backend (server.ts)              │
│           Express + Socket.io on port 5004            │
│                                                      │
│   ┌─────────────────┐    ┌────────────────────────┐  │
│   │   Nova Sonic     │    │    Session Store        │  │
│   │   Bidirectional  │    │    (Supabase)           │  │
│   │   Stream Client  │    └────────────────────────┘  │
│   └────────┬────────┘                                 │
│            │ AWS Bedrock                              │
│            ▼                                          │
│   ┌─────────────────┐    ┌────────────────────────┐  │
│   │  Tool: parse     │──►│  Nova Act Service       │  │
│   │  VoiceInteraction│    │  (Python + CDP)         │  │
│   └─────────────────┘    └────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

---

## Local Development Setup

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | v20+ | Backend server & extension build |
| **npm** | v9+ | Dependency management |
| **Python** | 3.10+ | Nova Act browsing agent |
| **Google Chrome** | Latest | Extension host & CDP target |

### 1. Clone and Install

```bash
git clone https://github.com/<your-org>/SkyVoice.git
cd SkyVoice

# Install backend dependencies
npm install --prefix backend

# Install extension dependencies
npm install --prefix extension
```

### 2. Configure Environment

Create `backend/.env` with your credentials:

```env
# AWS Bedrock (required — powers Nova Sonic voice AI)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1

# Server
PORT=5004

# Supabase (required — session persistence)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Create `backend/nova-act-service/.env` for the browsing agent:

```env
# Same AWS credentials as above
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1

# Nova Act API key (required for autonomous browsing)
NOVA_ACT_API_KEY=your_nova_act_api_key

PORT=5004
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 3. Set Up Supabase

Run the schema in your Supabase SQL Editor:

```bash
# Copy the contents of backend/schema.sql into your Supabase SQL Editor
# This creates the sessions and messages tables with RLS policies
```

### 4. Set Up Python Environment (Nova Act)

```bash
cd backend/nova-act-service
python3 -m venv .venv
source .venv/bin/activate        # macOS/Linux
# .venv\Scripts\activate         # Windows

pip install -r requirements.txt
playwright install chromium
cd ../..
```

### 5. Start the Backend

```bash
cd backend
node src/server.ts
```

The server will start on `http://localhost:5004`. You should see:
```
Server listening on port 5004
```

### 6. Build & Load the Chrome Extension

```bash
# Build the extension
npm run build --prefix extension
```

Then load it into Chrome:

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **"Load unpacked"**
4. Select the `extension/dist/` folder
5. The SkyVoice icon will appear in your toolbar
6. Click the icon → **Open Side Panel** to start

### 7. Launch Chrome with CDP (for Nova Act browsing)

Nova Act needs a Chrome instance with remote debugging enabled:

**macOS:**
```bash
# Quit Chrome completely first, then:
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

**Windows:**
```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

> **Note:** If Chrome is already running, it will refuse the debugging flag. Either quit Chrome entirely first, or use a temporary profile:
> ```bash
> /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
>   --remote-debugging-port=9222 \
>   --user-data-dir=/tmp/skyvoice-cdp
> ```

---

## One-Step Deploy (Local or EC2)

For a quick launch that installs, builds, and runs everything:

```bash
npm run deploy
```

This runs: `npm install` (both packages) → `extension build` → `node backend/src/server.ts`

---

## ECS (Containerized) Deployment

The repository includes a production-ready `Dockerfile` that bundles the Node.js orchestration layer, Python browsing service, and Headless Chrome.

1. **Build and Push**:
   ```bash
   docker build -t skyvoice-platform .
   docker tag skyvoice-platform:latest <your-ecr-repo-url>:latest
   docker push <your-ecr-repo-url>:latest
   ```

2. **ECS Configuration**:
   - **Task Role**: Ensure the task role has `bedrock:InvokeModelWithBidirectionalStream` permissions.
   - **Port**: Map container port `5004` to your host/load balancer.
   - **Environment**: Inject your Supabase and AWS credentials via ECS Environment Variables.

---

## Project Structure

```
SkyVoice/
├── backend/
│   ├── src/
│   │   ├── server.ts          # Main Socket.io server (voice + session orchestration)
│   │   ├── client.ts          # AWS Bedrock bidirectional stream client
│   │   ├── consts.ts          # System prompt, schemas, audio config
│   │   ├── session-store.ts   # Supabase session persistence
│   │   ├── supabase.ts        # Supabase client initialization
│   │   ├── types.ts           # TypeScript type definitions
│   │   ├── handler.ts         # AWS Lambda handler (serverless deployment)
│   │   └── audio-test.ts      # Offline Sonic pipeline test
│   ├── nova-act-service/
│   │   ├── nova.py            # Nova Act autonomous browsing agent
│   │   ├── requirements.txt   # Python dependencies
│   │   └── .env               # Nova Act credentials
│   ├── schema.sql             # Supabase database schema
│   ├── package.json
│   └── tsconfig.json
├── extension/
│   ├── src/
│   │   ├── App.tsx            # Main UI (landing + chat view)
│   │   ├── hooks/
│   │   │   └── use-audio-streaming.ts  # Core audio/socket hook
│   │   ├── components/
│   │   │   ├── message-bubble.tsx      # Chat message component
│   │   │   ├── waveform-visualizer.tsx # Live audio waveform
│   │   │   └── status-banner.tsx       # AI state banner
│   │   └── lib/
│   │       ├── pcm-encoder.ts # PCM audio encoding utils
│   │       └── utils.ts       # Tailwind merge helper
│   ├── public/
│   │   ├── audio-processor.js       # Mic capture AudioWorklet
│   │   └── audio-player-processor.js # TTS playback AudioWorklet
│   ├── manifest.json          # Chrome Extension manifest v3
│   ├── vite.config.ts
│   └── package.json
├── Dockerfile                 # Production container (Node + Python + Chrome)
├── package.json               # Root workspace scripts
└── README.md
```

---

## Security and Compliance

SkyVoice is built for secure, enterprise environments. We recommend the following IAM policy for production deployment:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": ["bedrock:InvokeModelWithBidirectionalStream"],
            "Resource": ["arn:aws:bedrock:*:*:model/amazon.nova-2-sonic-v1:0"]
        }
    ]
}
```

---

**SkyVoice: Give the Web a Voice.**
