# SkyVoice 

**Premium Assistive AI Concierge for Airline Passengers**

## The Problem
Traditional screen readers often struggle with dynamic, complex web interfaces like transportation seat maps, visual calendars, or interactive booking flows. This creates a critical accessibility gap, making it nearly impossible for users with visual impairments to book travel or navigate modern web applications independently.

## Our Mission
SkyVoice leverages Amazon Nova's cutting-edge multimodal capabilities to transform complex visual layouts into intuitive, conversation-driven interactions. We empower users to navigate the digital world with gold-standard autonomy and a premium concierge experience.

## Recent Engineering Highlights

We've recently optimized the interaction pipeline to reach industry-leading snappiness and reliability:

- **Consolidated AI Response Pipeline**: Engineered a "one turn, one response" system. Nova now delivers its spoken feedback and structured seat data in a single, unified turn, eliminating fragmented "bubble spam" in the UI.
- **Smart Silence Watchdog**: Implemented a backend-driven Voice Activity Detection (VAD) layer. If the user stops speaking for 1.2s, the system automatically triggers a response, mirroring the reliability of manual "Stop" buttons but in a completely hands-free way.
- **Cross-Stream Deduplication**: Built a sophisticated message-ID tracking system that merges real-time transcript streams with final tool outputs. Users see a single, clean black bubble for every AI response, even when complex seat selections are happening behind the scenes.
- **Continuous Audio Streaming**: Modernized the audio pipeline to stream raw audio including ambient silence. This provides Bedrock's Nova model with the full context needed for precise natural language understanding and turn-taking.

## Project Structure

- **`/extension`**: High-performance React-based Chrome Extension (Vite + Tailwind CSS). Features a glassmorphism design and real-time waveform visualization.
- **`/backend`**: Node.js backend utilizing `amazon.nova-2-sonic-v1` for real-time multimodal bidirectional streaming.
- **`/backend/nova-act-service`**: Python-based browsing layer using `nova-act` for autonomous UI manipulation.

## AI Pipeline Architecture 

Our system orchestrates specialized Amazon Nova models to handle complex multimodal interactions:

1. **Nova Sonic (Multimodal Reasoning)**: Sonic handles the high-performance raw audio processing and simultaneous visual reasoning. It analyzes the user's voice and the UI state (the seat map) in parallel to identify the optimal response.
2. **Nova Act (Autonomous Execution)**: Once an intent is identified (e.g., "Book Charlie Puth with an aisle seat"), Nova Act takes over the "acting" phase. It autonomously translates the AI's decision into precise browser interactions.
3. **Sonic TTS (Immediate Feedback)**: While Nova Act is manipulating the DOM, Sonic's TTS engine immediately begins streaming natural, low-latency audio feedback, ensuring the user feels a seamless, real-time response.

---

## Getting Started

### 1. Prerequisites

- **Python 3.10+** (for Nova Act service)
- **Node.js 18+** (for Backend and Extension)
- **Google Chrome** (with a dedicated profile for automation)
- **AWS Account** (with Bedrock Nova access in `us-east-1` or `us-west-2`)

### 2. Chrome Remote Debugging Setup

SkyVoice requires a Chrome instance running with **Remote Debugging** enabled so the AI can control the browser.

1. **Close all existing Chrome instances**
2. **Launch Chrome via Terminal** (Mac ARM):
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="$(pwd)/backend/nova-act-service/chrome_demo_profile"
   ```
3. **Navigate to the target website** (e.g., Ticketmaster or any page with a seat map) in this specific Chrome window.

### 3. Nova Act Service Setup (Python)

This service handles the actual clicking and searching on the web page.

1. Navigate to the service directory:
   ```bash
   cd backend/nova-act-service
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file in `backend/nova-act-service/`:
   ```env
   NOVA_ACT_API_KEY=your_key_from_nova.amazon.com
   ```

### 4. Backend Setup (Node.js)

The backend orchestrates the voice stream and triggers the Python browsing layer.

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in `backend/`:
   ```env
   AWS_ACCESS_KEY_ID=your_key
   AWS_SECRET_ACCESS_KEY=your_secret
   AWS_REGION=us-east-1
   PORT=5004
   # Point to your Python binary (especially if using a venv)
   # Mac/Linux: ./nova-act-service/.venv/bin/python
   # Windows: ./nova-act-service/.venv/Scripts/python.exe
   NOVA_PYTHON_BIN=./nova-act-service/.venv/bin/python

   # Supabase Persistence
   SUPABASE_URL=your_project_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```
4. Start the server (Dev Mode):
   ```bash
   npx tsx src/server.ts
   ```

### 5. Extension Setup (Chrome Side Panel)

1. Navigate to the `extension` directory:
   ```bash
   cd extension
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. **Load into Chrome**:
   - **Build the extension**: `npm run build` (This generates the `dist` folder).
   - Open `chrome://extensions/` in Chrome.
   - Enable **Developer mode** (top right).
   - Click **Load unpacked**.
   - Select the `extension/dist` folder.
   - *Tip: The extension runs in the **Side Panel**. Open the Side Panel in Chrome and select "SkyVoice" from the dropdown.*

---

## AWS Permissions

### Option A: Quick Start (AWS Managed Policies)
Attach these to your IAM user for hackathon speed:
- `AmazonBedrockFullAccess`
- `IAMFullAccess` (to manage keys)

### Option B: Least Privilege (Recommended)
Create a custom policy with this JSON:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModelWithBidirectionalStream"
            ],
            "Resource": [
                "arn:aws:bedrock:*:*:model/amazon.nova-2-sonic-v1:0"
            ]
        }
    ]
}
```

---

## Common Gotchas & Troubleshooting

- **Port Mismatch**: If the extension says "Connection Failed", ensure `backend/.env` has `PORT=5004`.
- **Chrome Not Found**: If Nova Act fails to attach, double check that Chrome is running with `--remote-debugging-port=9222`.
- **Microphone Permission**: The extension requires microphone access. If it doesn't prompt, check your Chrome site settings for `localhost`.
- **Bedrock Region**: Nova Sonic is currently available in specific AWS regions (e.g., `us-east-1`). Ensure your `.env` matches your Bedrock model availability.
