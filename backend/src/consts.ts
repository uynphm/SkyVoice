import { AudioType, AudioMediaType, TextMediaType } from "./types";

export const DefaultInferenceConfiguration = {
    maxTokens: 200,
    topP: 0.9,
    temperature: 0.2,
};

export const DefaultAudioInputConfiguration = {
    audioType: "SPEECH" as AudioType,
    encoding: "base64",
    mediaType: "audio/lpcm" as AudioMediaType,
    sampleRateHertz: 16000,
    sampleSizeBits: 16,
    channelCount: 1,
};

export const DefaultTextConfiguration = {
    mediaType: "text/plain" as TextMediaType,
};

export const VoiceInteractionSchema = JSON.stringify({
    type: "object",
    properties: {
        type: {
            type: "string",
            enum: ["action", "clarification", "response", "error"],
            description:
                "Interaction category. 'action' = execute a UI change, " +
                "'clarification' = ask a follow-up, 'response' = general reply, " +
                "'error' = invalid or unsupported request.",
        },
        intent: {
            type: "string",
            enum: [
                "select_seat",
                "ask_preference",
                "confirm_selection",
                "navigate",
                "summarize",
                "fallback",
            ],
            description: "The specific intent parsed from the user's speech.",
        },
        reasoning: {
            type: "string",
            description:
                "One-sentence explanation of why this intent was chosen.",
        },
        speech: {
            type: "string",
            description:
                "The ONLY spoken reply to the user. This is read aloud by TTS. " +
                "Must be natural, warm, and concise (1-2 sentences max).",
        },
        next_step: {
            type: "string",
            enum: ["await_user", "execute_action", "ask_clarification"],
            description: "What the system should do after this turn.",
        },
        data: {
            type: "object",
            description: "Payload for the intent (all fields optional).",
            properties: {
                seat_id: { type: "string", description: "e.g. '14A'" },
                row: { type: "number" },
                section: {
                    type: "string",
                    description: "e.g. 'front', 'back', 'exit_row'",
                },
            },
        },
        constraints: {
            type: "object",
            description: "User preferences that must be respected.",
            properties: {
                max_price: { type: "number" },
                location_preference: {
                    type: "string",
                    enum: ["window", "aisle", "middle", "any"],
                },
                extra_legroom_required: { type: "boolean" },
            },
        },
        confidence: {
            type: "number",
            description: "0.0-1.0 confidence that the intent is correct.",
        },
    },
    required: ["type", "intent", "reasoning", "speech", "next_step"],
});

export const DefaultSystemPrompt = `
You are SkyVoice, a premium voice concierge for airline passengers.

## CORE RULE — ONE TOOL CALL PER TURN
Every time the user speaks, you MUST respond with exactly ONE call to
parseVoiceInteraction. That tool call is your ENTIRE response for the turn.

- Do NOT produce free-text speech outside the tool call.
- Do NOT call the tool more than once per turn.
- Do NOT generate another response after the tool returns.
- After the tool call, STOP and wait for the next user utterance.

## HOW TO RESPOND
Put your spoken reply in the "speech" field of the tool JSON.
The TTS engine reads that field aloud — it is the only voice output.
Keep speech warm, natural, and concise (1-2 sentences).

## PERSONALITY
- Sound like a luxury airline concierge: warm, professional, proactive.
- Always greet the user if they start a new conversation.
- Never be silent — even "hello" gets a friendly reply via the tool.

## INTENT DETECTION
- "window", "aisle", "front", "back", "legroom" → seat preference action.
- "how much", "price", "cheapest" → summarize constraints.
- Ambiguous input → ask_clarification with a short follow-up question.
- Off-topic or invalid → type "error", intent "fallback".

## EXAMPLE TURN
User: "I'd like a window seat near the front"
→ You call parseVoiceInteraction ONCE with:
  {
    "type": "action",
    "intent": "select_seat",
    "reasoning": "User wants a front window seat",
    "speech": "Great choice! I'll find the best front window seats for you.",
    "next_step": "execute_action",
    "data": { "section": "front" },
    "constraints": { "location_preference": "window" },
    "confidence": 0.95
  }
→ Then STOP. Do not speak or act again until the user speaks.
`.trim();

export const DefaultAudioOutputConfiguration = {
    ...DefaultAudioInputConfiguration,
    sampleRateHertz: 24000,
    voiceId: "tiffany",
};
