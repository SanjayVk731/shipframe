import type { FrameContext } from '../shared/types'

export const FRAME_CONTEXT_LIMITS = {
  maxDepth: 5,
  maxTextNodes: 50,
  maxCharsPerNode: 300,
  maxAnnotations: 20,
  maxTotalChars: 8000,
} as const

export type CollectResult =
  | { ok: true; value: FrameContext }
  | { ok: false; reason: 'node-missing' }

interface MinNode {
  id: string
  type: string
  name: string
  characters?: string
  visible: boolean
  children: MinNode[]
  annotations: { label: string }[]
}

export async function collectFrameContext(
  nodeId: string,
  workItemType: string | undefined,
): Promise<CollectResult> {
  const root = (await figma.getNodeByIdAsync(nodeId)) as MinNode | null
  if (!root) return { ok: false, reason: 'node-missing' }

  const textLayers: string[] = []
  let truncatedTextCount = 0

  function walk(node: MinNode, depth: number) {
    if (!node.visible) return
    if (node.type === 'TEXT') {
      if (textLayers.length >= FRAME_CONTEXT_LIMITS.maxTextNodes) {
        truncatedTextCount += 1
        return
      }
      const chars = node.characters ?? ''
      const truncated =
        chars.length > FRAME_CONTEXT_LIMITS.maxCharsPerNode
          ? chars.slice(0, FRAME_CONTEXT_LIMITS.maxCharsPerNode - 1) + '…'
          : chars
      textLayers.push(truncated)
      return
    }
    // Only recurse into container nodes within the depth cap
    if (depth > FRAME_CONTEXT_LIMITS.maxDepth) return
    for (const child of node.children) walk(child, depth + 1)
  }

  for (const child of root.children) walk(child, 1)

  if (truncatedTextCount > 0) {
    textLayers.push(`…and ${truncatedTextCount} more text nodes truncated`)
  }

  // Total-char cap across collected text layers.
  let totalChars = 0
  let cappedTextLayers: string[] = []
  let droppedChars = 0
  for (const layer of textLayers) {
    if (layer.startsWith('…and ')) {
      cappedTextLayers.push(layer)
      continue
    }
    if (totalChars + layer.length > FRAME_CONTEXT_LIMITS.maxTotalChars) {
      droppedChars += layer.length
      continue
    }
    cappedTextLayers.push(layer)
    totalChars += layer.length
  }
  if (droppedChars > 0) {
    cappedTextLayers = cappedTextLayers.filter((l) => !l.startsWith('…and '))
    cappedTextLayers.push(`…and ${droppedChars} more chars truncated`)
  }

  const annotations = (root.annotations ?? [])
    .slice(0, FRAME_CONTEXT_LIMITS.maxAnnotations)
    .map((a) => a.label)

  return {
    ok: true,
    value: {
      frameName: root.name,
      workItemType,
      annotations,
      textLayers: cappedTextLayers,
    },
  }
}
