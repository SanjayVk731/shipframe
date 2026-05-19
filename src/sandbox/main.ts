import type { UiToSandbox, SandboxToUi } from '../messages/protocol'
import { isUiToSandbox } from '../messages/protocol'
import { classifySelection, exportThumbnail } from './selection'
import { writeLink, clearLink } from './nodeLink'
import { getFileConfig, setFileConfig } from '../storage/fileConfig'
import { getPat, setPat } from '../storage/credentials'

figma.showUI(__html__, { width: 360, height: 560, themeColors: true })

function post(msg: SandboxToUi): void {
  figma.ui.postMessage(msg)
}

async function findNode(nodeId: string): Promise<SceneNode | null> {
  // documentAccess: dynamic-page requires async lookups.
  const found = await figma.getNodeByIdAsync(nodeId)
  if (!found) return null
  // Page/Document have a `type` field but aren't scene nodes.
  if (found.type === 'DOCUMENT' || found.type === 'PAGE') return null
  return found as SceneNode
}

async function pushSelection(): Promise<void> {
  post({ type: 'selection-changed', state: classifySelection(figma.currentPage.selection) })
}

figma.on('selectionchange', () => {
  void pushSelection()
})

figma.on('currentpagechange', () => {
  void pushSelection()
})

figma.ui.onmessage = async (raw: unknown) => {
  if (!isUiToSandbox(raw)) return
  const msg = raw as UiToSandbox
  try {
    switch (msg.type) {
      case 'get-selection-state': {
        post({
          type: 'selection-state',
          state: classifySelection(figma.currentPage.selection),
          requestId: msg.requestId,
        })
        return
      }
      case 'export-thumbnail': {
        const node = await findNode(msg.nodeId)
        if (!node) {
          post({ type: 'error', reason: 'not_found', requestId: msg.requestId })
          return
        }
        try {
          const result = await exportThumbnail(node)
          post({
            type: 'thumbnail',
            nodeId: msg.nodeId,
            image: result.bytes,
            oversized: result.oversized,
            requestId: msg.requestId,
          })
        } catch (e) {
          post({
            type: 'error',
            reason: e instanceof Error ? e.message : 'export_failed',
            requestId: msg.requestId,
          })
        }
        return
      }
      case 'write-ticket-link': {
        const node = await findNode(msg.nodeId)
        if (!node) {
          post({ type: 'error', reason: 'not_found', requestId: msg.requestId })
          return
        }
        writeLink(node, msg.link)
        post({ type: 'ack', requestId: msg.requestId })
        return
      }
      case 'clear-ticket-link': {
        const node = await findNode(msg.nodeId)
        if (!node) {
          post({ type: 'error', reason: 'not_found', requestId: msg.requestId })
          return
        }
        clearLink(node)
        post({ type: 'ack', requestId: msg.requestId })
        return
      }
      case 'get-file-config': {
        post({
          type: 'file-config',
          config: getFileConfig(),
          requestId: msg.requestId,
        })
        return
      }
      case 'set-file-config': {
        setFileConfig(msg.config)
        post({ type: 'ack', requestId: msg.requestId })
        return
      }
      case 'get-pat': {
        const pat = await getPat(msg.providerId)
        post({ type: 'pat', providerId: msg.providerId, pat, requestId: msg.requestId })
        return
      }
      case 'set-pat': {
        await setPat(msg.providerId, msg.pat)
        post({ type: 'ack', requestId: msg.requestId })
        return
      }
      case 'focus-node': {
        const node = await findNode(msg.nodeId)
        if (!node) {
          post({ type: 'error', reason: 'not_found', requestId: msg.requestId })
          return
        }
        figma.currentPage.selection = [node]
        figma.viewport.scrollAndZoomIntoView([node])
        post({ type: 'ack', requestId: msg.requestId })
        return
      }
      case 'open-external': {
        figma.openExternal(msg.url)
        return
      }
      default: {
        const _exhaustive: never = msg
        void _exhaustive
        return
      }
    }
  } catch (e) {
    // Only requests with a requestId expect a response. open-external has none.
    if ('requestId' in msg) {
      post({
        type: 'error',
        reason: e instanceof Error ? e.message : 'sandbox_error',
        requestId: msg.requestId,
      })
    }
  }
}
