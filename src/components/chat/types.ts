// types.ts

// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the three model-facing types.
// Previously these were scattered (some in ChatWindow.tsx as locals, some
// here) and had drifted apart. If you're working on anything that touches
// messages, conversations, or settings — edit here, not elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

export type TokenUsage = {
  prompt?: number
  response?: number
  total?: number
}

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  ts: number
  // Only one of these. `modelUsed` is what the assistant-turn writer
  // sets and what the time-stamp line renders. (`model` and
  // `modelDisplayName` were never set anywhere in the codebase — dead.)
  modelUsed?: string

  // User attachments
  files?: { name: string; type: string; id?: string }[]
  hasImages?: boolean

  // Misc flags
  isUncensored?: boolean
  hasCode?: boolean
  tokens?: TokenUsage
}

export type AttachedFile = {
  id: string
  name: string
  type: string
  // Full data URL for images, text content for text files. There's no
  // separate `dataUrl` — keeping one source of truth avoids drift.
  content: string
  size: number

  // The `data:image/...;base64,` prefix-stripped form. Used for the
  // multimodal payload sent to Ollama. Optional — set only for images.
  rawBase64?: string

  // Processing status — surfaced in the UI when a read is slow.
  status?: 'pending' | 'processing' | 'ready' | 'error'
  error?: string
  hash?: string
}

// Settings are written to localStorage under SETTINGS_KEY. The fields
// here are the *only* settings the app should care about. Anything new
// needs to be added to `defaultSettings()` and `loadSettings()` in
// ChatWindow.tsx at the same time. (Previously this type and the local
// `StoredSettings` in ChatWindow were two different shapes — collapsed
// into one.)
export type StoredSettings = {
  autoRoute: boolean
  autoCorrect: boolean
  ephemeral: boolean
  uncensored: boolean
  activeModel: string
  temperature: number
  memoryEnabled: boolean
}

export type ConversationMetadata = {
  modelUsed?: string
  totalTokens?: number
  uncensoredMode?: boolean
  fileCount?: number
  codeCount?: number
  imageCount?: number
  primaryModel?: string
}

// `wasEphemeral` is snapshotted when the conversation is created so
// memory decisions stay correct even if the toggle changes mid-chat.
export type Conversation = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Message[]
  wasEphemeral?: boolean
  metadata?: ConversationMetadata
}

// ─────────────────────────────────────────────────────────────────────────────
// Model & file metadata
// ─────────────────────────────────────────────────────────────────────────────

export type ModelInfo = {
  id: string
  name: string
  description: string
  capabilities: {
    multimodal: boolean
    maxContext: number
    streaming: boolean
    functionCalling: boolean
    vision?: {
      supportedFormats: string[]
      maxImageSize: number
      maxImagesPerRequest: number
    }
  }
  performance: {
    speed: 'fast' | 'medium' | 'slow'
    quality: 'basic' | 'good' | 'excellent'
    memory: 'low' | 'medium' | 'high'
    ramRequirement?: number
  }
  tags: string[]
  provider?: 'ollama' | 'openai' | 'cloud'
}

export type FileUploadResult = {
  success: boolean
  file?: AttachedFile
  error?: string
  imageInfo?: {
    width?: number
    height?: number
    format?: string
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ollama response shapes
// ─────────────────────────────────────────────────────────────────────────────

export type AIResponse = {
  content: string
  model: string
  tokens?: {
    prompt: number
    response: number
    total: number
  }
  // Ollama may add finish-reason values over time; 'unload' is a real
  // one it currently emits when the model is unloaded mid-stream.
  finishReason?: 'stop' | 'length' | 'error' | 'unload' | string
  error?: string
  imagesProcessed?: number
}

export type StreamChunk = {
  content: string
  done: boolean
  tokens?: TokenUsage
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt + tool-calling plumbing (not currently used but the
// shapes are correct — leave them so the tool-calling work doesn't
// require re-inventing the types later)
// ─────────────────────────────────────────────────────────────────────────────

export type SystemPromptConfig = {
  mode: 'standard' | 'uncensored'
  context?: string
  files?: AttachedFile[]
  customInstructions?: string
  visionMode?: boolean
  imageAnalysisDepth?: 'basic' | 'detailed' | 'expert'
}

export type ToolDefinitionParameter = {
  type: string
  description: string
  enum?: string[]
}

export type ToolDefinition = {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, ToolDefinitionParameter>
    required: string[]
  }
}

export type ToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string // JSON string
  }
}

export type ToolResult = {
  toolCallId: string
  result: unknown
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Image analysis
// ─────────────────────────────────────────────────────────────────────────────

export type ImageAnalysisRequest = {
  image: AttachedFile
  prompt?: string
  model?: string
  context?: string
}

export type ImageAnalysisResult = {
  description?: string
  objects?: string[]
  text?: string
  labels?: string[]
  confidence?: number
  error?: string
}

export type VisionConfig = {
  enabled: boolean
  defaultModel: string
  maxImageSize: number
  supportedFormats: string[]
  autoSwitch: boolean
  compressionQuality?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Misc UI shapes
// ─────────────────────────────────────────────────────────────────────────────

export type FileProcessingStatus =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'error'
  | 'cancelled'

export type ConversationStats = {
  totalMessages: number
  totalTokens: number
  fileCount: number
  imageCount: number
  // Code-block counting is not implemented anywhere — if you wire it up
  // in MessageRenderer with a regex against `renderContent` output, this
  // field becomes live. Otherwise treat it as always 0.
  codeBlocks: number
  averageResponseTime: number
  modelsUsed: string[]
  uncensoredModeUsed: boolean
}

export type QuickActionCategory = 'code' | 'analysis' | 'image' | 'general'

export type QuickAction = {
  id: string
  label: string
  prompt: string
  icon?: React.ComponentType<{ size?: number }>
  category?: QuickActionCategory
}

export type ThemeConfig = {
  mode: 'dark' | 'light' | 'system'
  accentColor?: string
  fontFamily?: string
  codeTheme?: 'dark' | 'light' | 'github' | 'monokai'
}

export type KeyboardShortcut = {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  action: string
  description: string
}