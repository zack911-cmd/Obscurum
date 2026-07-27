// MODELS.ts

export const MODELS = {
  coder: 'minimax-m3:cloud',
  'Offline, Coder': 'qwen2.5-coder:latest',
  reasoner: 'gpt-oss:120b-cloud',
  vision: 'qwen2.5vl:3b-q4_K_M',
} as const;

// Type for the model keys
export type ModelKey = keyof typeof MODELS;
export type ModelValue = typeof MODELS[ModelKey];

// Additional model metadata
export const MODEL_METADATA: Record<ModelValue, {
  displayName: string
  description: string
  speed: 'fast' | 'medium' | 'slow'
  quality: 'basic' | 'good' | 'excellent'
  multimodal: boolean
  maxContext: number
  tags: string[]
}> = {
  [MODELS.coder]: {
    displayName: 'Minimax M3',
    description: 'Fast, efficient coding assistant (cloud)',
    speed: 'fast',
    quality: 'excellent',
    multimodal: false,
    maxContext: 16384,
    tags: ['code', 'fast', 'cloud', 'minimax'],
  },
  [MODELS['Offline, Coder']]: {
    displayName: 'Qwen2.5 Coder',
    description: 'Offline coding assistant (latest)',
    speed: 'fast',
    quality: 'good',
    multimodal: false,
    maxContext: 8192,
    tags: ['local', 'code', 'offline', 'coder'],
  },
  [MODELS.reasoner]: {
    displayName: 'GPT-OSS Reasoner',
    description: 'Deep reasoning and analysis model (120B, cloud)',
    speed: 'medium',
    quality: 'excellent',
    multimodal: false,
    maxContext: 8192,
    tags: ['reasoning', 'analysis', 'cloud', '120b'],
  },
  [MODELS.vision]: {
    displayName: 'Qwen2.5-VL 3B (Vision)',
    description: 'Lightweight, fast multimodal model optimized for 8GB RAM',
    speed: 'fast',
    quality: 'good',
    multimodal: true,
    maxContext: 8192,
    tags: ['vision', 'multimodal', 'lightweight', 'fast'],
  },
};

// Multimodal models that can handle images
export const MULTIMODAL_MODELS = [
  'qwen2.5vl:3b-q4_K_M',
];

// Check if a model is multimodal (supports images)
export function isMultimodalModel(model: string): boolean {
  return MULTIMODAL_MODELS.some(m => model.includes(m));
}

// Get model by capability
export function getModelByCapability(
  capability: 'fast' | 'reasoning' | 'heavy' | 'local' | 'multimodal'
): ModelValue {
  switch (capability) {
    case 'fast':
      return MODELS.coder
    case 'reasoning':
      return MODELS.reasoner
    case 'heavy':
      return MODELS.coder // fallback to coder since heavy was removed
    case 'local':
      return MODELS['Offline, Coder']
    case 'multimodal':
      return MODELS.vision
    default:
      return MODELS.coder
  }
}

// Get model display info
export function getModelInfo(model: ModelValue): typeof MODEL_METADATA[ModelValue] | undefined {
  return MODEL_METADATA[model];
}

// Get all model options for dropdown
export function getModelOptions(): Array<{ value: ModelValue; label: string; disabled?: boolean }> {
  return Object.values(MODELS).map(model => ({
    value: model,
    label: MODEL_METADATA[model]?.displayName || model,
    disabled: false,
  }));
}

// Get recommended model for a specific task
export function recommendModel(
  task: 'code' | 'analysis' | 'exploit' | 'image' | 'general'
): ModelValue {
  switch (task) {
    case 'code':
    case 'exploit':
      return MODELS.coder
    case 'analysis':
      return MODELS.reasoner
    case 'image':
      return MODELS.vision
    case 'general':
    default:
      return MODELS.coder
  }
}