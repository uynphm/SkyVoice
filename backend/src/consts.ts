import { AudioType, AudioMediaType, TextMediaType } from "./types";

export const DefaultInferenceConfiguration = {
    maxTokens: 1024,
    topP: 0.9,
    temperature: 0.7,
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
    "type": "object",
    "properties": {
        "reasoning": {
            "type": "string",
            "description": "Brief explanation of why this intent and action were chosen based on the user's input and current context."
        },
        "next_step": {
            "type": "string",
            "enum": ["await_user", "execute_action", "ask_clarification"],
            "description": "The state machine directive for what the system should do immediately after processing this interaction."
        },
        "type": {
            "type": "string",
            "enum": ["action", "clarification", "response", "error"],
            "description": "The high-level type of the voice interaction. Use 'action' for UI updates, 'clarification' to ask the user a follow-up, 'response' for general chat, and 'error' if the request is invalid."
        },
        "intent": {
            "type": "string",
            "enum": ["select_seat", "ask_preference", "confirm_selection", "navigate", "summarize", "fallback"],
            "description": "The specific intent parsed from the user's speech."
        },
        "data": {
            "type": "object",
            "description": "Specific functional data needed to execute the intent.",
            "properties": {
                "seat_id": { "type": "string", "description": "e.g., '14A'" },
                "row": { "type": "number" },
                "section": { "type": "string", "description": "e.g., 'front', 'back', 'exit_row'" }
            }
        },
        "constraints": {
            "type": "object",
            "description": "Strict user preferences that must be adhered to.",
            "properties": {
                "max_price": { "type": "number" },
                "location_preference": { "type": "string", "enum": ["window", "aisle", "middle", "any"] },
                "extra_legroom_required": { "type": "boolean" }
            }
        },
        "context": {
            "type": "object",
            "description": "System state memory (e.g., seats already selected, or previous errors)."
        },
        "speech": {
            "type": "string",
            "description": "The script that the Text-to-Speech engine should read aloud to the user."
        },
        "confidence": {
            "type": "number",
            "description": "Confidence score from 0.0 to 1.0 that the intent was correctly understood."
        }
    },
    "required": ["reasoning", "next_step", "type", "intent", "speech"]
});

// // ✅ GOOD (plain object; let JSON.stringify happen only at transport time)
// export const VoiceInteractionSchema = {
//   "type": "object",
//   "properties": {
//     "reasoning": {
//       "type": "string",
//       "description": "Brief explanation of why this intent and action were chosen based on the user's input and current context."
//     },
//     "next_step": {
//       "type": "string",
//       "enum": ["await_user", "execute_action", "ask_clarification"],
//       "description": "The state machine directive for what the system should do immediately after processing this interaction."
//     },
//     "type": {
//       "type": "string",
//       "enum": ["action", "clarification", "response", "error"],
//       "description": "The high-level type of the voice interaction. Use 'action' for UI updates, 'clarification' to ask the user a follow-up, 'response' for general chat, and 'error' if the request is invalid."
//     },
//     "intent": {
//       "type": "string",
//       "enum": ["select_seat", "ask_preference", "confirm_selection", "navigate", "summarize", "fallback"],
//       "description": "The specific intent parsed from the user's speech."
//     },
//     "ui_action": {
//       "type": "string",
//       "enum": ["highlight_seat", "zoom_map", "filter_results", "clear_selection", "none"],
//       "description": "The specific visual action the frontend UI must perform in response to this interaction."
//     },
//     "data": {
//       "type": "object",
//       "description": "Specific functional data needed to execute the intent.",
//       "properties": {
//         "seat_id": { "type": "string", "description": "e.g., '14A'" },
//         "row": { "type": "number" },
//         "section": { "type": "string", "description": "e.g., 'front', 'back', 'exit_row'" }
//       }
//     },
//     "constraints": {
//       "type": "object",
//       "description": "Strict user preferences that must be adhered to.",
//       "properties": {
//         "max_price": { "type": "number" },
//         "location_preference": { "type": "string", "enum": ["window", "aisle", "middle", "any"] },
//         "extra_legroom_required": { "type": "boolean" }
//       }
//     },
//     "context": {
//       "type": "object",
//       "description": "System state memory (e.g., seats already selected, or previous errors)."
//     },
//     "speech": {
//       "type": "string",
//       "description": "The script that the Text-to-Speech engine should read aloud to the user."
//     },
//     "confidence": {
//       "type": "number",
//       "description": "Confidence score from 0.0 to 1.0 that the intent was correctly understood."
//     }
//   },
//   "required": ["reasoning", "next_step", "type", "intent", "ui_action", "speech"]
// };


export const getSkyVoiceSystemPrompt = (): string => `
You are SkyVoice, a premium and enthusiastic voice concierge for airline passengers. 

## YOUR PERSONALITY
- You are eager to help, professional, and very proactive.
- You should sound like a luxury airline concierge.
- NEVER be silent if the user speaks to you. Even if you just heard "hello", reply with a warm greeting.

## CORE MISSIONS
1. **Greet & Guide**: Always greet the user warmly if they start a conversation.
2. **Detect Intent**: If the user mentions "window", "aisle", "front", or "back", acknowledge it immediately.
3. **Execute Seat Changes**: Use the 'parseVoiceInteraction' tool as soon as the user identifies a seat or a strong preference.
4. **Speak & Act**: Always provide your spoken response in the 'speech' field of the tool call.

## CONVERSATION FLOW
- USER says: "i want a window seat"
- YOU say: "Certainly! I'll find the best window seats for you. Would you prefer to be near the front of the cabin or further back?"
- THEN: Call 'parseVoiceInteraction' with the preference data.

## DATA FORMAT (Inside 'parseVoiceInteraction')
{
  "type": "action | clarification | response",
  "intent": "select_seat | ask_preference | confirm_selection | navigate",
  "reasoning": "Concierge reasoning",
  "speech": "Your warm, natural spoken response",
  "data": { "seat_id": "optional", "row": "optional", "section": "optional" },
  "next_step": "await_user | execute_action"
}
`;

export const DefaultSystemPrompt = getSkyVoiceSystemPrompt();

export const DefaultAudioOutputConfiguration = {
    ...DefaultAudioInputConfiguration,
    sampleRateHertz: 24000,
    voiceId: "matthew",
};

