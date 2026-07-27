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
  X,
  RotateCw,
  RotateCcw,
  Loader2,
  FileText,
  FileSpreadsheet,
  FileJson,
  FileType,
} from 'lucide-react'
import { useState, memo, useRef, useEffect, useCallback } from 'react'
import type { AttachedFile } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const MAX_TEXT_SIZE = 1 * 1024 * 1024  // 1MB for text files
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB for images
const MAX_IMAGE_PREVIEW_SIZE = 5 * 1024 * 1024 // 5MB for preview

// ─────────────────────────────────────────────────────────────────────────────
// File-type detection — single source of truth
// ─────────────────────────────────────────────────────────────────────────────

const TEXT_FILE_RE =
  /\.(py|sh|bash|zsh|fish|ps1|vbs|bat|cmd|asm|nse|lua|swift|kt|scala|ex|exs|pl|pm|c|cpp|h|hpp|java|rb|php|rs|go|js|jsx|ts|tsx|json|yaml|yml|xml|toml|ini|cfg|conf|env|html|log|md|txt|csv|tsv|r|rdata|jl|clj|edn|nim|v|zig|dart|fs|fsx|vb|vbs|psm1|psd1)$/i

// Binary but displayable as text
const DISPLAYABLE_BINARY_RE = /\.(pcap|pcapng|bin|hex|payload|exploit|shellcode|dmp|core|dump)$/i

function isTextName(name: string): boolean {
  return TEXT_FILE_RE.test(name)
}

function isDisplayableBinary(name: string): boolean {
  return DISPLAYABLE_BINARY_RE.test(name)
}

function isImageType(type: string): boolean {
  return type.startsWith('image/')
}

function isVideoType(type: string): boolean {
  return type.startsWith('video/')
}

function isAudioType(type: string): boolean {
  return type.startsWith('audio/')
}

function isPdfType(type: string, name: string): boolean {
  return type === 'application/pdf' || /\.pdf$/i.test(name)
}

function isOfficeType(type: string, name: string): boolean {
  const officeTypes = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ]
  const officeExts = /\.(doc|docx|xls|xlsx|ppt|pptx)$/i
  return officeTypes.includes(type) || officeExts.test(name)
}

// File type detection with icons
function getFileIcon(type: string, name: string) {
  if (isImageType(type)) return FileImage
  if (isVideoType(type)) return File
  if (isAudioType(type)) return File
  if (isPdfType(type, name)) return FileText
  if (isOfficeType(type, name)) return FileSpreadsheet
  if (isTextName(name)) return FileCode
  if (isDisplayableBinary(name)) return Terminal
  if (/\.(zip|tar|gz|bz2|7z|rar)$/i.test(name)) return FileArchive
  if (/\.(json|yaml|yml)$/i.test(name)) return FileJson
  if (/\.(ini|cfg|conf|env)$/i.test(name)) return FileType
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
    'csv': 'csv',
    'tsv': 'csv',
    'r': 'r',
    'jl': 'julia',
    'clj': 'clojure',
    'nim': 'nim',
    'v': 'v',
    'zig': 'zig',
    'dart': 'dart',
    'fs': 'fsharp',
    'fsx': 'fsharp',
    'vb': 'vbnet',
    'psm1': 'powershell',
    'psd1': 'powershell',
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
// Image compression
// ─────────────────────────────────────────────────────────────────────────────

export async function compressImage(
  dataUrl: string,
  maxWidth: number = 1024,
  maxHeight: number = 1024,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      let width = img.width
      let height = img.height

      // Calculate new dimensions maintaining aspect ratio
      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }
      if (height > maxHeight) {
        width = (width * maxHeight) / height
        height = maxHeight
      }

      // Create canvas and draw compressed image
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      // Use better image smoothing
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, width, height)

      // Get compressed data URL
      const compressed = canvas.toDataURL('image/jpeg', quality)
      resolve(compressed)
    }
    img.onerror = () => reject(new Error('Failed to load image for compression'))
    img.src = dataUrl
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Image preview modal with enhanced controls
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
  const [rotation, setRotation] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [positionStart, setPositionStart] = useState({ x: 0, y: 0 })
  const [isLoading, setIsLoading] = useState(true)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'r') setRotation(r => (r + 90) % 360)
    if (e.key === 'R') setRotation(r => (r - 90) % 360)
    if (e.key === '0') { setZoom(1); setPosition({ x: 0, y: 0 }) }
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setPositionStart(position)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    setPosition({
      x: positionStart.x + dx,
      y: positionStart.y + dy,
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.25, 5))
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.25, 0.25))
  const handleReset = () => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
    setRotation(0)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative max-w-[95vw] max-h-[95vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Controls */}
        <div className="absolute top-4 left-4 flex gap-2 z-10">
          <div className="flex items-center gap-1 bg-black/60 rounded-lg border border-white/20 p-1">
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded hover:bg-white/10 text-white transition-colors"
              title="Zoom in (scroll)"
            >
              <ZoomIn size={16} />
            </button>
            <span className="text-white/60 text-xs font-mono min-w-[40px] text-center">
              {(zoom * 100).toFixed(0)}%
            </span>
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded hover:bg-white/10 text-white transition-colors"
              title="Zoom out (scroll)"
            >
              <ZoomOut size={16} />
            </button>
          </div>
        </div>

        <div className="absolute top-4 right-4 flex gap-2 z-10">
          <button
            onClick={() => setRotation(r => (r + 90) % 360)}
            className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors border border-white/20"
            title="Rotate clockwise (r)"
          >
            <RotateCw size={16} />
          </button>
          <button
            onClick={() => setRotation(r => (r - 90) % 360)}
            className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors border border-white/20"
            title="Rotate counter-clockwise (R)"
          >
            <RotateCcw size={16} />
          </button>
          <button
            onClick={handleReset}
            className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors border border-white/20"
            title="Reset (0)"
          >
            <Maximize2 size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-black/60 hover:bg-black/80 text-white transition-colors border border-white/20"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Info bar */}
        <div className="absolute bottom-4 left-4 right-4 flex justify-between text-white/60 text-xs font-mono bg-black/60 p-2 rounded-lg border border-white/10">
          <span>{alt}</span>
          <span className="flex items-center gap-3">
            <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
            <span>Rotation: {rotation}°</span>
            {zoom > 1 && <span className="text-white/40">(drag to pan)</span>}
          </span>
        </div>

        {/* Image */}
        <div 
          className="relative overflow-hidden"
          style={{ cursor: zoom > 1 ? 'grab' : 'default' }}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={32} className="text-white/40 animate-spin" />
            </div>
          )}
          <img
            src={src}
            alt={alt}
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
              transformOrigin: 'center',
              transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            }}
            className="max-w-full max-h-[85vh] object-contain select-none"
            onLoad={() => setIsLoading(false)}
            onError={() => setIsLoading(false)}
            onMouseDown={handleMouseDown}
            draggable={false}
          />
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-white/30 text-xs font-mono">
          Scroll to zoom • Drag to pan • R to rotate
        </div>
      </div>
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// File preview chip
// ─────────────────────────────────────────────────────────────────────────────

export const FileAttachmentPreview = memo(function FileAttachmentPreview({
  file,
  isUncensored = false,
}: {
  file: AttachedFile
  isUncensored?: boolean
}) {
  const [showPreview, setShowPreview] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [isCompressing, setIsCompressing] = useState(false)
  const [compressedPreview, setCompressedPreview] = useState<string | null>(null)
  const previewRef = useRef<HTMLImageElement>(null)

  const isImage = isImageType(file.type)
  const isText = isTextFile(file)
  const isDisplayable = isDisplayableBinary(file.name)
  const hasError = file.content === '[ERROR]' || file.content.startsWith('data:;base64,')
  const isTooLarge = file.size && file.size > MAX_IMAGE_PREVIEW_SIZE

  const Icon = getFileIcon(file.type, file.name)
  const language = detectLanguage(file.name)

  const borderClass = isUncensored
    ? 'border-red-500/40 shadow-red-500/10'
    : 'border-ghost-border/70'

  const headerBg = isUncensored
    ? 'bg-red-900/20'
    : 'bg-ghost-surface-2/80'

  // Compress large images for preview
  useEffect(() => {
    if (isImage && !hasError && !imageError && isTooLarge && !compressedPreview) {
      setIsCompressing(true)
      compressImage(file.content, 800, 800, 0.7)
        .then(compressed => {
          setCompressedPreview(compressed)
          setIsCompressing(false)
        })
        .catch(() => {
          setIsCompressing(false)
          // Fall back to original
          setCompressedPreview(file.content)
        })
    }
  }, [isImage, hasError, imageError, isTooLarge, file.content, compressedPreview])

  const previewSrc = compressedPreview || file.content

  return (
    <>
      <div className={`mt-2 p-2 rounded-xl border ${borderClass} bg-ghost-surface-2/50 shadow-lg shadow-black/20`}>
        <div className={`flex items-center gap-2 p-1.5 rounded-lg ${headerBg}`}>
          <div className={`p-1 rounded ${isUncensored ? 'bg-red-500/20' : 'bg-ghost-surface-3/50'}`}>
            <Icon size={14} className={isUncensored ? 'text-red-400' : 'text-ghost-text-dim'} />
          </div>

          <span className="font-mono text-sm truncate text-ghost-text flex-1" title={file.name}>
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

          {isTooLarge && isImage && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-[8px] font-mono uppercase tracking-wider border border-yellow-500/30 flex-shrink-0">
              {isCompressing ? (
                <Loader2 size={8} className="animate-spin" />
              ) : (
                <AlertCircle size={8} />
              )}
              {isCompressing ? 'Compressing...' : 'Compressed'}
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
              {isCompressing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 size={24} className="text-white animate-spin" />
                </div>
              )}
              <img
                ref={previewRef}
                src={previewSrc}
                alt={file.name}
                className={`max-w-full max-h-48 object-contain mx-auto transition-opacity ${isCompressing ? 'opacity-50' : 'hover:opacity-90'}`}
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
              <span className="flex items-center gap-1">
                <Image size={10} />
                {file.type || 'image'}
              </span>
              <span>{formatFileSize(file.size)}</span>
              {isTooLarge && compressedPreview && (
                <span className="text-green-400/60">(compressed for preview)</span>
              )}
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

        {isDisplayable && !hasError && (
          <div className="mt-2 relative">
            <div className="absolute top-1 right-1 flex items-center gap-1 text-[8px] text-ghost-text-dim font-mono bg-black/60 px-1.5 py-0.5 rounded border border-ghost-border/30">
              <Terminal size={8} />
              Binary
            </div>
            <pre className={`p-2 rounded-lg bg-black/40 text-xs overflow-auto max-h-32 border border-ghost-border/30
              font-mono leading-relaxed ${isUncensored ? 'text-red-300' : 'text-ghost-text'}`}
            >
              {file.content.substring(0, 800)}
              {file.content.length > 800 && (
                <span className="text-ghost-text-dim">... (truncated)</span>
              )}
            </pre>
          </div>
        )}

        {!isImage && !isText && !isDisplayable && !hasError && (
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
          src={previewSrc}
          alt={file.name}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// File reading — async, with size limits and error handling
// ─────────────────────────────────────────────────────────────────────────────

export interface FileReadProgress {
  fileName: string
  loaded: number
  total: number
  status: 'reading' | 'processing' | 'complete' | 'error'
}

export async function readFiles(
  fileList: FileList,
  onProgress?: (progress: FileReadProgress) => void
): Promise<AttachedFile[]> {
  const results: AttachedFile[] = []

  for (const file of Array.from(fileList)) {
    const isImage = isImageType(file.type)
    const isText = file.type.startsWith('text/') || isTextName(file.name)
    const isDisplayable = isDisplayableBinary(file.name)

    // Progress update
    onProgress?.({
      fileName: file.name,
      loaded: 0,
      total: file.size,
      status: 'reading',
    })

    if (file.size > MAX_FILE_SIZE) {
      results.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type || 'application/octet-stream',
        content: '[ERROR]',
        size: file.size,
        rawBase64: undefined,
        error: 'File too large (max 20MB)',
      })
      onProgress?.({
        fileName: file.name,
        loaded: file.size,
        total: file.size,
        status: 'error',
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
        error: 'Image too large (max 10MB)',
      })
      onProgress?.({
        fileName: file.name,
        loaded: file.size,
        total: file.size,
        status: 'error',
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

        onProgress?.({
          fileName: file.name,
          loaded: file.size,
          total: file.size,
          status: 'processing',
        })
      } else if (isText || isDisplayable) {
        const maxSize = MAX_TEXT_SIZE
        if (file.size > maxSize) {
          const blob = file.slice(0, maxSize)
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
        onProgress?.({
          fileName: file.name,
          loaded: file.size,
          total: file.size,
          status: 'processing',
        })
      } else {
        content = `[BINARY_FILE size=${formatFileSize(file.size)} type=${file.type || 'unknown'}]`
        onProgress?.({
          fileName: file.name,
          loaded: file.size,
          total: file.size,
          status: 'processing',
        })
      }

      results.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type || 'application/octet-stream',
        content,
        size: file.size,
        rawBase64,
      })

      onProgress?.({
        fileName: file.name,
        loaded: file.size,
        total: file.size,
        status: 'complete',
      })
    } catch (error) {
      console.error('File read error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      results.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type || 'application/octet-stream',
        content: '[ERROR]',
        size: file.size,
        rawBase64: undefined,
        error: errorMessage,
      })
      onProgress?.({
        fileName: file.name,
        loaded: file.size,
        total: file.size,
        status: 'error',
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
      const isDisplayable = isDisplayableBinary(f.name)

      if (isImage) {
        const dims = f.dimensions ? ` (${f.dimensions.width}x${f.dimensions.height})` : ''
        return `[IMAGE_ATTACHMENT filename="${f.name}" type="${f.type}" size="${formatFileSize(f.size)}"${dims}]\nImage data is available for analysis. Please describe what you see in this image, including any text, diagrams, or notable features.\n[/IMAGE_ATTACHMENT]`
      }

      if (isDisplayable) {
        return `[BINARY_ATTACHMENT filename="${f.name}" type="${f.type}" size="${formatFileSize(f.size)}"]\n\`\`\`hex\n${f.content}\n\`\`\`\n[/BINARY_ATTACHMENT]`
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
  const isOffice = isOfficeType(file.type, file.name)
  const isPdf = isPdfType(file.type, file.name)

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
  } else if (isPdf) {
    color = 'text-red-400'
    label = 'PDF'
  } else if (isOffice) {
    color = 'text-amber-400'
    label = 'Office'
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

// Compress images for sending to models
export async function compressImagesForModel(
  files: AttachedFile[],
  maxWidth: number = 1024,
  maxHeight: number = 1024,
  quality: number = 0.7
): Promise<AttachedFile[]> {
  const results: AttachedFile[] = []

  for (const file of files) {
    if (isImageFile(file) && hasValidImageData(file)) {
      try {
        const compressed = await compressImage(file.content, maxWidth, maxHeight, quality)
        const rawBase64 = extractRawBase64(compressed)
        results.push({
          ...file,
          content: compressed,
          rawBase64: rawBase64 || file.rawBase64,
        })
      } catch {
        // If compression fails, use original
        results.push(file)
      }
    } else {
      results.push(file)
    }
  }

  return results
}

// Detect if a file is potentially malicious
export function isPotentiallyMalicious(file: File | AttachedFile): {
  isMalicious: boolean
  reason?: string
} {
  const name = 'name' in file ? file.name : ''
  const type = 'type' in file ? file.type : ''

  // Check for double extensions (e.g., .jpg.exe)
  const parts = name.split('.')
  if (parts.length > 2) {
    const lastExt = parts[parts.length - 1].toLowerCase()
    const secondLast = parts[parts.length - 2].toLowerCase()
    const dangerousExts = ['exe', 'msi', 'dll', 'scr', 'com', 'bat', 'cmd', 'vbs', 'js', 'jar']
    if (dangerousExts.includes(lastExt) && !dangerousExts.includes(secondLast)) {
      return { isMalicious: true, reason: 'Double extension detected (possible masquerading)' }
    }
  }

  // Check for dangerous MIME types
  const dangerousTypes = ['application/x-msdownload', 'application/x-msdos-program', 'application/x-msi']
  if (dangerousTypes.includes(type)) {
    return { isMalicious: true, reason: 'Dangerous file type detected' }
  }

  return { isMalicious: false }
}