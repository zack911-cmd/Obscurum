// FileAttachment.tsx
import { 
  FileImage, 
  AlertCircle, 
  FileCode,
  FileArchive,
  File,
  Terminal,
  Flame,
  Image,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X
} from 'lucide-react'
import { useState, memo } from 'react'
import type { AttachedFile } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// File-type detection — single source of truth
// ─────────────────────────────────────────────────────────────────────────────

// One regex for "is this a text/source file" — was duplicated in 3 spots
// and they had already drifted apart (preview had html/log, the others
// didn't). Drift here = silently stripping code from the prompt OR
// skipping the in-app preview when one of them disagrees.
const TEXT_FILE_RE =
  /\.(py|sh|bash|zsh|fish|ps1|vbs|bat|cmd|asm|nse|lua|swift|kt|scala|ex|exs|pl|pm|c|cpp|h|hpp|java|rb|php|rs|go|js|jsx|ts|tsx|json|yaml|yml|xml|toml|ini|cfg|conf|env|html|log|md|txt)$/i

function isTextName(name: string): boolean {
  return TEXT_FILE_RE.test(name)
}

function isImageType(type: string): boolean {
  return type.startsWith('image/')
}

// File type detection with icons
function getFileIcon(type: string, name: string) {
  if (isImageType(type)) return FileImage

  if (isTextName(name)) return FileCode

  if (/\.(zip|tar|gz|bz2|7z|rar)$/i.test(name)) {
    return FileArchive
  }

  if (/\.(pcap|pcapng|bin|hex|payload|exploit|shellcode)$/i.test(name)) {
    return Terminal
  }

  return File
}

// File language detection for syntax highlighting
function detectLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, string> = {
    'py': 'python',
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'rs': 'rust',
    'go': 'go',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'java': 'java',
    'rb': 'ruby',
    'php': 'php',
    'pl': 'perl',
    'pm': 'perl',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'fish': 'fish',
    'ps1': 'powershell',
    'vbs': 'vbscript',
    'bat': 'batch',
    'cmd': 'batch',
    'asm': 'asm',
    'nse': 'lua',
    'lua': 'lua',
    'swift': 'swift',
    'kt': 'kotlin',
    'scala': 'scala',
    'ex': 'elixir',
    'exs': 'elixir',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'toml': 'toml',
    'ini': 'ini',
    'cfg': 'ini',
    'conf': 'ini',
    'env': 'env',
    'html': 'html',
    'md': 'markdown',
  }
  return langMap[ext] || 'plaintext'
}

// Helper to get file size display
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// Extract raw base64 from data URL (remove the prefix)
export function extractRawBase64(dataUrl: string): string | null {
  if (!dataUrl) return null

  const match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/)
  if (match) return match[1]

  const parts = dataUrl.split(',')
  if (parts.length > 1) return parts[1]

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Image preview modal — wrapped in memo so the parent re-rendering the
// chat during a stream doesn't re-diff the modal's props.
// ─────────────────────────────────────────────────────────────────────────────
const ImagePreviewModal = memo(function ImagePreviewModal({
  src,
  alt,
  onClose,
}: {
  src: string
  alt: string
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(1)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-4 right-4 flex gap-2 z-10">
          <button
            onClick={() => setZoom(z => Math.min(z + 0.25, 3))}
            className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors border border-white/20"
            title="Zoom in"
          >
            <ZoomIn size={18} />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}
            className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors border border-white/20"
            title="Zoom out"
          >
            <ZoomOut size={18} />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors border border-white/20"
            title="Reset zoom"
          >
            <Maximize2 size={18} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors border border-white/20"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="absolute bottom-4 left-4 right-4 text-center text-white/60 text-xs font-mono bg-black/60 p-2 rounded-lg border border-white/10">
          {alt} • {zoom.toFixed(2)}x
        </div>

        <img
          src={src}
          alt={alt}
          style={{ transform: `scale(${zoom})` }}
          className="transition-transform duration-200 max-w-full max-h-full object-contain"
        />
      </div>
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// File preview chip
// ─────────────────────────────────────────────────────────────────────────────
// memo'd because this lives inside the chat. During a stream, the parent
// re-renders many times — without this wrapper React would re-diff this
// component's props (and the isText/isImage checks) on every chunk, even
// though the file's identity and content haven't changed.
export const FileAttachmentPreview = memo(function FileAttachmentPreview({
  file,
  isUncensored = false,
}: {
  file: AttachedFile
  isUncensored?: boolean
}) {
  const [showPreview, setShowPreview] = useState(false)
  const [imageError, setImageError] = useState(false)

  const isImage = isImageType(file.type)
  // Single source of truth — keeps the preview, `readFiles()`, and the
  // prompt formatter in lockstep on what counts as a "text" file.
  const isText = isTextFile(file)
  const hasError = file.content === '[ERROR]' || file.content.startsWith('data:;base64,')
  const isTooLarge = file.size && file.size > 10 * 1024 * 1024

  const Icon = getFileIcon(file.type, file.name)
  const language = detectLanguage(file.name)

  const borderClass = isUncensored
    ? 'border-red-500/40 shadow-red-500/10'
    : 'border-ghost-border/70'

  const headerBg = isUncensored
    ? 'bg-red-900/20'
    : 'bg-ghost-surface-2/80'

  return (
    <>
      <div className={`mt-2 p-2 rounded-xl border ${borderClass} bg-ghost-surface-2/50 shadow-lg shadow-black/20`}>
        <div className={`flex items-center gap-2 p-1.5 rounded-lg ${headerBg}`}>
          <div className={`p-1 rounded ${isUncensored ? 'bg-red-500/20' : 'bg-ghost-surface-3/50'}`}>
            <Icon size={14} className={isUncensored ? 'text-red-400' : 'text-ghost-text-dim'} />
          </div>

          <span className="font-mono text-sm truncate text-ghost-text flex-1">
            {file.name}
          </span>

          <span className="text-ghost-text-dim text-[10px] font-mono flex-shrink-0">
            {formatFileSize(file.size)}
          </span>

          {isUncensored && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[8px] font-mono uppercase tracking-wider border border-red-500/30 flex-shrink-0">
              <Flame size={8} />
              UNCENSORED
            </span>
          )}

          {isTooLarge && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-[8px] font-mono uppercase tracking-wider border border-yellow-500/30 flex-shrink-0">
              <AlertCircle size={8} />
              LARGE
            </span>
          )}

          {isImage && !hasError && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[8px] font-mono uppercase tracking-wider border border-blue-500/30 flex-shrink-0">
              <Image size={8} />
              Vision
            </span>
          )}
        </div>

        {hasError && (
          <div className="mt-2 flex items-center gap-2 text-red-400 bg-red-500/10 p-2 rounded-lg border border-red-500/20">
            <AlertCircle size={14} />
            <span className="text-xs font-mono">Failed to load file — may be corrupted or unsupported</span>
          </div>
        )}

        {isImage && !hasError && !imageError && (
          <div className="mt-2 relative group">
            <div
              className="relative max-h-48 overflow-hidden rounded-lg border border-ghost-border/40 bg-black/20 cursor-pointer"
              onClick={() => setShowPreview(true)}
            >
              <img
                src={file.content}
                alt={file.name}
                className="max-w-full max-h-48 object-contain mx-auto transition-opacity hover:opacity-90"
                onError={() => setImageError(true)}
              />

              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                <div className="flex items-center gap-2 bg-black/80 px-3 py-1.5 rounded-lg border border-white/20">
                  <ZoomIn size={14} className="text-white" />
                  <span className="text-white text-xs font-mono">Click to zoom</span>
                </div>
              </div>
            </div>

            <div className="mt-1 flex justify-between text-[9px] text-ghost-text-dim font-mono">
              <span>Image • {formatFileSize(file.size)}</span>
              <span className="flex items-center gap-1">
                <Image size={10} />
                {file.type || 'unknown type'}
              </span>
            </div>
          </div>
        )}

        {isImage && (hasError || imageError) && (
          <div className="mt-2 flex flex-col items-center justify-center p-4 rounded-lg bg-black/20 border border-ghost-border/30">
            <FileImage size={24} className="text-ghost-text-dim mb-2" />
            <span className="text-xs text-ghost-text-dim font-mono">
              {hasError ? 'Failed to load image' : 'Image format not supported'}
            </span>
          </div>
        )}

        {isText && !hasError && (
          <div className="mt-2 relative">
            <div className="absolute top-1 right-1 flex items-center gap-1 text-[8px] text-ghost-text-dim font-mono bg-black/60 px-1.5 py-0.5 rounded border border-ghost-border/30">
              <FileCode size={8} />
              {language}
            </div>
            <pre className={`p-2 rounded-lg bg-black/40 text-xs overflow-auto max-h-32 border border-ghost-border/30
              font-mono leading-relaxed ${isUncensored ? 'text-red-300' : 'text-ghost-text'}`}
            >
              {file.content.substring(0, 800)}
              {file.content.length > 800 && (
                <span className="text-ghost-text-dim">... (truncated)</span>
              )}
            </pre>
            {file.content.length > 800 && (
              <div className="mt-1 text-[9px] text-ghost-text-dim font-mono text-right">
                {file.content.length.toLocaleString()} chars shown (truncated)
              </div>
            )}
          </div>
        )}

        {!isImage && !isText && !hasError && (
          <div className="mt-2 flex items-center gap-2 text-ghost-text-dim text-xs font-mono p-2 bg-black/20 rounded-lg border border-ghost-border/30">
            <File size={12} />
            <span>Binary file — {formatFileSize(file.size)}</span>
            {file.size > 1024 * 1024 && (
              <span className="text-yellow-400/60">(large file)</span>
            )}
            {file.type && file.type !== 'application/octet-stream' && (
              <span className="text-ghost-text-dimmer">• {file.type}</span>
            )}
          </div>
        )}
      </div>

      {showPreview && !imageError && (
        <ImagePreviewModal
          src={file.content}
          alt={file.name}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// File reading — async, with size limits
// ─────────────────────────────────────────────────────────────────────────────
export async function readFiles(fileList: FileList): Promise<AttachedFile[]> {
  const results: AttachedFile[] = []
  const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB limit
  const MAX_TEXT_SIZE = 1 * 1024 * 1024  // 1MB for text files
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB for images

  for (const file of Array.from(fileList)) {
    const isImage = isImageType(file.type)
    // Use the single source of truth — same regex as the preview and
    // `isTextFile()`. Previously had its own copy that drifted from the
    // others on which extensions counted.
    const isText = file.type.startsWith('text/') || isTextName(file.name)

    if (file.size > MAX_FILE_SIZE) {
      results.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type || 'application/octet-stream',
        content: '[ERROR]',
        size: file.size,
        rawBase64: undefined,
      })
      continue
    }

    if (isImage && file.size > MAX_IMAGE_SIZE) {
      results.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type || 'application/octet-stream',
        content: '[ERROR]',
        size: file.size,
        rawBase64: undefined,
      })
      continue
    }

    try {
      let content: string
      let rawBase64: string | undefined = undefined

      if (isImage) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = e => resolve((e.target?.result as string) ?? '')
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(file)
        })

        content = dataUrl
        rawBase64 = extractRawBase64(dataUrl) ?? undefined

        if (!rawBase64) {
          console.warn(`⚠️ Could not extract raw base64 from image: ${file.name}`)
        }
      } else if (isText) {
        if (file.size > MAX_TEXT_SIZE) {
          const blob = file.slice(0, MAX_TEXT_SIZE)
          content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = e => {
              const text = (e.target?.result as string) || ''
              resolve(text + '\n\n... [file truncated due to size]')
            }
            reader.onerror = () => reject(reader.error)
            reader.readAsText(blob)
          })
        } else {
          content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = e => resolve((e.target?.result as string) ?? '')
            reader.onerror = () => reject(reader.error)
            reader.readAsText(file)
          })
        }
      } else {
        content = `[BINARY_FILE size=${file.size} type=${file.type || 'unknown'}]`
      }

      results.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type || 'application/octet-stream',
        content,
        size: file.size,
        rawBase64,
      })
    } catch (error) {
      console.error('File read error:', error)
      results.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type || 'application/octet-stream',
        content: '[ERROR]',
        size: file.size,
        rawBase64: undefined,
      })
    }
  }

  return results
}

export function formatFilesForPrompt(files: AttachedFile[]): string {
  const validFiles = files.filter(f => f.content !== '[ERROR]' && !f.content.startsWith('[BINARY_FILE'))

  if (validFiles.length === 0) {
    return ''
  }

  return validFiles
    .map(f => {
      const lang = detectLanguage(f.name)
      const isImage = isImageType(f.type)

      if (isImage) {
        return `[IMAGE_ATTACHMENT filename="${f.name}" type="${f.type}" size="${formatFileSize(f.size)}"]\nImage data is available for analysis. Describe what you see in this image.\n[/IMAGE_ATTACHMENT]`
      }

      return `[FILE_ATTACHMENT filename="${f.name}" type="${f.type}" language="${lang}" size="${formatFileSize(f.size)}"]\n\`\`\`${lang}\n${f.content}\n\`\`\`\n[/FILE_ATTACHMENT]`
    })
    .join('\n\n')
}

// Helper to get file info for display
export function getFileInfo(file: AttachedFile): {
  icon: typeof File
  color: string
  label: string
} {
  const Icon = getFileIcon(file.type, file.name)
  const isImage = isImageType(file.type)
  const isCode = isTextName(file.name) && /\.(py|js|jsx|ts|tsx|rs|go|c|cpp|java|rb|php|sh|bash)$/i.test(file.name)
  const isSecurity = /\.(pcap|pcapng|bin|hex|payload|exploit|shellcode)$/i.test(file.name)

  let color = 'text-ghost-text-dim'
  let label = 'File'

  if (isImage) {
    color = 'text-blue-400'
    label = 'Image'
  } else if (isCode) {
    color = 'text-green-400'
    label = 'Code'
  } else if (isSecurity) {
    color = 'text-red-400'
    label = 'Security'
  } else if (/\.(json|yaml|yml|xml)$/i.test(file.name)) {
    color = 'text-yellow-400'
    label = 'Data'
  }

  return { icon: Icon, color, label }
}

// Validation function for file types
export function isValidFileType(file: File, acceptedTypes: string): boolean {
  const types = acceptedTypes.split(',').map(t => t.trim())
  const ext = file.name.split('.').pop()?.toLowerCase() || ''

  return types.some(type => {
    if (type.startsWith('.')) {
      return `.${ext}` === type
    }
    if (type.includes('/*')) {
      const baseType = type.replace('/*', '')
      return file.type.startsWith(baseType)
    }
    return file.type === type || file.name.endsWith(type)
  })
}

// Security: Sanitize file content for display
export function sanitizeFileContent(content: string, maxLines = 1000): string {
  const lines = content.split('\n')
  if (lines.length > maxLines) {
    return lines.slice(0, maxLines).join('\n') + '\n\n... [truncated]'
  }
  return content
}

// Check if file is an image
export function isImageFile(file: AttachedFile): boolean {
  return isImageType(file.type)
}

// Check if file is text — public, uses the shared regex
export function isTextFile(file: AttachedFile): boolean {
  return file.type.startsWith('text/') || isTextName(file.name)
}

// Get image dimensions from data URL
export function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve({ width: img.width, height: img.height })
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}

// Get raw base64 from an image file
export function getRawBase64FromFile(file: AttachedFile): string | null {
  if (!file.rawBase64) {
    return extractRawBase64(file.content)
  }
  return file.rawBase64
}

// Check if file has valid image data
export function hasValidImageData(file: AttachedFile): boolean {
  if (!isImageFile(file)) return false
  if (file.content === '[ERROR]') return false
  if (file.content.startsWith('data:;base64,')) return false

  const rawBase64 = getRawBase64FromFile(file)
  return !!rawBase64 && rawBase64.length > 0
}

// Get all images with valid data for multimodal models
export function getValidImagesForOllama(files: AttachedFile[]): string[] {
  return files
    .filter(f => isImageFile(f) && hasValidImageData(f))
    .map(f => getRawBase64FromFile(f))
    .filter((data): data is string => !!data && data.length > 0)
}