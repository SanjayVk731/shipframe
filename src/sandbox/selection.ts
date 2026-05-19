import type { SelectionState } from '../shared/types'
import { readLink } from './nodeLink'

const SUPPORTED: ReadonlySet<string> = new Set([
  'FRAME',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'SECTION',
])

export function classifySelection(nodes: readonly SceneNode[]): SelectionState {
  if (nodes.length === 0) return { kind: 'none' }
  if (nodes.length > 1) return { kind: 'multi' }
  const node = nodes[0]!
  if (!SUPPORTED.has(node.type)) return { kind: 'unsupported' }
  return {
    kind: 'single',
    nodeId: node.id,
    nodeName: node.name,
    link: readLink(node),
    annotationsCount: countAnnotations(node),
    textLayersCount: countTextLayers(node),
  }
}

function countTextLayers(node: SceneNode, depth = 0): number {
  if (depth > 5) return 0
  // Some node types don't expose `visible` (e.g., DOCUMENT/PAGE), so we only
  // skip when it's explicitly false. The supported types above all have it.
  if ('visible' in node && (node as { visible: boolean }).visible === false) return 0
  if (node.type === 'TEXT') return 1
  const children = (node as unknown as { children?: SceneNode[] }).children ?? []
  let total = 0
  for (const c of children) total += countTextLayers(c, depth + 1)
  return total
}

function countAnnotations(node: SceneNode): number {
  const ann = (node as unknown as { annotations?: Array<{ label: string }> }).annotations
  return Array.isArray(ann) ? ann.length : 0
}

const MAX_THUMB_EDGE = 2048
// Hard cap on the PNG byte size we attach to a ticket. Both Azure DevOps
// (~60MB limit) and Notion (5MB on free workspaces) accept files of this size,
// and beyond it the upload either fails or sits long enough that we'd rather
// skip and tell the user. Large sections — esp. multi-frame sections — are the
// usual cause.
const MAX_THUMB_BYTES = 5 * 1024 * 1024

export type ThumbnailResult =
  | { bytes: Uint8Array; oversized: false }
  | { bytes: null; oversized: true }

export async function exportThumbnail(node: SceneNode): Promise<ThumbnailResult> {
  const exportable = node as unknown as {
    width: number
    height: number
    exportAsync: (settings: ExportSettings) => Promise<Uint8Array>
  }
  const longest = Math.max(exportable.width, exportable.height)
  const scale = longest > MAX_THUMB_EDGE ? MAX_THUMB_EDGE / longest : 2
  const bytes = await exportable.exportAsync({
    format: 'PNG',
    constraint: { type: 'SCALE', value: scale },
  })
  if (bytes.length > MAX_THUMB_BYTES) {
    return { bytes: null, oversized: true }
  }
  return { bytes, oversized: false }
}
