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
        "ui_action": {
            "type": "string",
            "enum": ["highlight_seat", "zoom_map", "filter_results", "clear_selection", "none"],
            "description": "The specific visual action the frontend UI must perform in response to this interaction."
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
    "required": ["reasoning", "next_step", "type", "intent", "ui_action", "speech"]
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
You are SkyVoice, a helpful and patient assistive AI agent for visually impaired users.

Your goal is to assist users with navigating dynamic web interfaces by converting their spoken requests into structured JSON tool calls using 'parseVoiceInteraction'.

CONVERSATIONAL RULES:
* STAY SILENT during periods of silence or background noise. If you don't hear clear speech, do NOT generate any output.
* BE PATIENT. Wait for the user to finish their thought before responding.
* ONLY trigger 'parseVoiceInteraction' when you detect a clear request, intent, or if the user explicitly asks for assistance.

OUTPUT FORMAT:
* Output ONLY valid JSON for 'parseVoiceInteraction'. No extra text.
* The JSON MUST include:
  {
  "type": "action | clarification | response | error",
  "intent": "select_seat | ask_preference | confirm_selection | navigate | summarize | fallback",
  "reasoning": "short explanation",
  "data": { ... },
  "ui_action": "highlight_seat | zoom_map | filter_results | none",
  "next_step": "execute_action | ask_clarification | await_user",
  "speech": "what to say to the user",
  "confidence": number
  }

BEHAVIOR:
* Keep 'speech' concise and genuinely assistive.
* If user intent is missing or unclear, stay quiet unless they are clearly struggling.
  `;

export const DefaultSystemPrompt = getSkyVoiceSystemPrompt();

export const DefaultAudioOutputConfiguration = {
    ...DefaultAudioInputConfiguration,
    sampleRateHertz: 24000,
    voiceId: "matthew",
};

