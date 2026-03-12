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

## AI Pipeline Architecture 

Our system orchestrates specialized Amazon Nova models to handle complex multimodal interactions:

1. **Nova Sonic (Multimodal Reasoning)**: Sonic handles the high-performance raw audio processing and simultaneous visual reasoning. It analyzes the user's voice and the UI state (the seat map) in parallel to identify the optimal response.
2. **Nova Act (Autonomous Execution)**: Once an intent is identified, Nova Act takes over the "acting" phase. It autonomously translates the AI's decision into precise browser interactions, such as selecting the exact coordinates for a window seat or navigating multipage booking flows.
3. **Sonic TTS (Immediate Feedback)**: While Nova Act is manipulating the DOM, Sonic's TTS engine immediately begins streaming natural, low-latency audio feedback, ensuring the user feels a seamless, real-time response.

## Getting Started
### Nova Act Service Setup

1. Navigate to the Nova Act service directory:
   ```bash
   cd backend/nova-act-service
   ```
2. Create a virtual environment and install dependencies:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. Configure your `.env` file with your Nova Act API key:
   ```env
   NOVA_ACT_API_KEY=your_key_from_nova.amazon.com
   ```

#### Chrome Browser Setup for Nova Act (Sighted Mode)

To allow the AI to attach to your physical browser for demos, you must launch Chrome with remote debugging enabled:

1. **Quit all your Chrome browsers completely** (Cmd+Q on Mac, Alt+F4 on Windows).

2. **Launch via Terminal**:
   - **Mac (Apple Silicon)**:
     ```bash
     arch -arm64 /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="$(pwd)/nova_profile"
     ```
   - **Windows**:
     ```powershell
     & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$pwd\nova_profile"
     ```
   *Note: Using a dedicated `--user-data-dir` ensures your main browser history/cookies remain isolated.*

3. **Open your target page** (e.g., Ticketmaster or SeatGeek) in the new window.

4. **Start the Sighted Copilot**:
   - **Mac**: `arch -arm64 python nova.py`
   - **Windows**: `python nova.py`

**Troubleshooting Precision:**
If the AI is clicking slightly off-target, ensure your browser window is at or near **1600x813** resolution. The `nova.py` script will attempt to snap the viewport to this "Golden Resolution" automatically for 1:1 coordinate precision.
### Extension Setup

1. Navigate to the `extension` directory:
   ```bash
   cd extension
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run in development mode:
   ```bash
   npm run dev
   ```
4. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `extension` folder (or `dist` after building).

### Backend Setup

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your AWS credentials:
   ```env
   AWS_ACCESS_KEY_ID=your_key
   AWS_SECRET_ACCESS_KEY=your_secret
   AWS_REGION=us-east-1
   ```
4. Start the server:
   ```bash
   npm run dev
   ```

#### Option A: Quick Start (AWS Managed Policies)

For rapid development (e.g., during a hackathon), you can attach the following **AWS Managed Policies** directly to your IAM user:
- `AmazonBedrockFullAccess`
- `AWSLambda_FullAccess`
- `AmazonAPIGatewayAdministrator`
- `AmazonS3FullAccess`
- `AWSCloudFormationFullAccess`
- `IAMFullAccess`

#### Option B: Recommended (Least Privilege Policy)

Navigate to the **IAM Console** > **Policies** > **Create policy**, select the **JSON** tab, and paste:

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

#### How to setup IAM User via AWS Console (UI):

1. **Create the User**:
   - Log in to your **AWS Console** and search for **IAM** in the top search bar.
   - Select **Users** from the sidebar, then click the orange **Create user** button.
   - **User details**: Give your user a name (like `skyvoice-local-dev`) and click **Next**.
   - **Permissions options**: Choose the box that says **Attach policies directly**.
   - **Permissions policies**: Use the search box to find and check the boxes for these 6 policies:
     - `AmazonBedrockFullAccess`
     - `AWSLambda_FullAccess`
     - `AmazonAPIGatewayAdministrator`
     - `AmazonS3FullAccess`
     - `AWSCloudFormationFullAccess`
     - `IAMFullAccess`
   - Click **Next**, then click **Create user**.

2. **Generate Access Keys**:
   - In the list of users, click on the name of the user you just created (`skyvoice-local-dev`).
   - Click the **Security credentials** tab (located in the middle of the screen).
   - Scroll down to the **Access keys** section and click **Create access key**.
   - Select **Local code** as the reason, check the confirmation box, and click **Next**.
   - Click **Create access key** on the final screen.
   - **IMPORTANT**: Copy the **Access key ID** and **Secret access key** now. Paste them into your `backend/.env` file.
