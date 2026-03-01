# SkyVoice 

**Assistive Browser Agent for visually impaired users**

## The Problem
Traditional screen readers often fail on dynamic, complex web interfaces like transportation seat maps, visual calendars, or interactive booking flows. This creates a critical accessibility gap, making it nearly impossible for visually impaired users to book travel or navigate modern web applications independently.

## Our Mission
SkyVoice leverages AI and voice technology to bridge this gap, transforming complex visual layouts into intuitive, conversation-driven interactions. We empower users to navigate the digital world with confidence and autonomy.

## Project Structure

- **`/extension`**: High-performance React-based Chrome Extension (Vite + Tailwind CSS).
- **`/backend`**: Node.js backend for processing voice commands and AI integration.

## AI Pipeline Architecture 
Our system orchestrates specialized Amazon Nova models to handle complex multimodal interactions. For this hackathon, we engineered a highly-optimized, low-latency pipeline to ensure a snappy, real-time user experience:

1. **Nova Sonic (Multimodal I/O & Reasoning)**: Sonic is natively multimodal. We pass it the user's raw audio *and* the current DOM state (available seats) directly in the prompt. Sonic simultaneously transcribes the audio, reasons over the constraints, and returns a single JSON object containing both the chosen seat ID and the explanation script.
2. **Nova Act & Sonic TTS (Parallel Execution)**: Once the decision is made, we execute the UI action and the voice feedback *at the exact same time*. Nova Act manipulates the DOM to highlight the chosen seat, while Sonic immediately begins streaming the Text-to-Speech explanation back to the user.

## Getting Started

### Extension Setup

1. Navigate to the `extension` directory:
   ```bash
   cd extension
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `extension/dist` folder.

### Updating Changes

Whenever you make changes to the extension source code:
1. **Rebuild the extension**:
   ```bash
   npm run build
   ```
2. **Refresh in Chrome**:
   - Go to `chrome://extensions/`
   - Click the **Refresh** (circular arrow) icon on the SkyVoice extension card.

### Backend Setup

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the backend:
   ```bash
   npm run build
   ```
4. Deploy to AWS Lambda:
   ```bash
   npx serverless deploy
   ```