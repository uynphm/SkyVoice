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
                "collect_booking_info",
                "confirm_booking_info",
                "start_booking_action",
                "navigate",
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
            description: "Payload for intent execution and extracted entities.",
            properties: {
                entities: {
                    type: "object",
                    description: "Structured entities extracted from user speech.",
                    properties: {
                        concert_name: { type: "string" },
                        concert_datetime: { type: "string" },
                        budget: { type: "string" },
                    },
                },
                missing_fields: {
                    type: "array",
                    description: "Required fields still missing.",
                    items: {
                        type: "string",
                        enum: ["concert_name", "concert_datetime", "budget"],
                    },
                },
                booking_ready: {
                    type: "boolean",
                    description: "True only when all required fields are present.",
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
You are SkyVoice, a premium voice concierge for concert ticket booking.

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
- Sound like a luxury booking concierge: warm, professional, proactive.
- Always greet the user if they start a new conversation.
- Never be silent — even "hello" gets a friendly reply via the tool.

## REQUIRED WORKFLOW
Collect 3 required fields from user conversation context:
1) concert_name
2) concert_datetime
3) budget

On every turn, return:
- data.entities (best known values)
- data.missing_fields (exactly which required fields are missing)
- data.booking_ready (true only when all 3 fields are available)

If any required field is missing:
- type = "clarification"
- intent = "collect_booking_info"
- next_step = "ask_clarification"
- speech asks for only the missing field(s)

If all required fields are present:
- type = "action"
- intent = "start_booking_action"
- next_step = "execute_action"
- speech confirms details briefly and says booking action is starting

If user confirms details but adds no new field:
- intent = "confirm_booking_info"

Off-topic or invalid input:
- type = "error", intent = "fallback"

## EXAMPLE TURN
User: "Book Charlie Puth tomorrow at 8pm, aisle seat please"
→ You call parseVoiceInteraction ONCE with:
  {
    "type": "action",
    "intent": "start_booking_action",
    "reasoning": "All required booking fields are present.",
    "speech": "Perfect, I have Charlie Puth, tomorrow at 8pm, and aisle seating. I am starting the booking now.",
    "next_step": "execute_action",
    "data": {
      "entities": {
        "concert_name": "Charlie Puth",
        "concert_datetime": "tomorrow 8pm",
        "budget": "$120"
      },
      "missing_fields": [],
      "booking_ready": true
    },
    "confidence": 0.95
  }
→ Then STOP. Do not speak or act again until the user speaks.
`.trim();

export const DefaultAudioOutputConfiguration = {
    ...DefaultAudioInputConfiguration,
    sampleRateHertz: 24000,
    voiceId: "tiffany",
};
