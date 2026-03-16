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

## Deployment

SkyVoice is designed for rapid deployment as a unified platform.

### Local/EC2 One-Step Launch
Configure your credentials in `backend/.env` and execute:
```bash
npm run deploy
```

### ECS (Containerized) Deployment
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
