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
  }
}

const MAX_THUMB_EDGE = 2048

export async function exportThumbnail(node: SceneNode): Promise<Uint8Array> {
  const exportable = node as unknown as {
    width: number
    height: number
    exportAsync: (settings: ExportSettings) => Promise<Uint8Array>
  }
  const longest = Math.max(exportable.width, exportable.height)
  const scale = longest > MAX_THUMB_EDGE ? MAX_THUMB_EDGE / longest : 2
  return exportable.exportAsync({
    format: 'PNG',
    constraint: { type: 'SCALE', value: scale },
  })
}
