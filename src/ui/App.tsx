import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSandbox } from './hooks/useSandbox'
import { SettingsView } from './views/SettingsView'
import { CreateView } from './views/CreateView'
import { LinkedView } from './views/LinkedView'
import { ViewHeader } from './components/ViewHeader'
import { getProvider } from '../providers/registry'
import { getAiConfig, setAiConfig, clearAiConfig } from '../storage/aiConfig'
import type {
  FileConfig,
  ProviderId,
  TicketInput,
  TicketLink,
  SelectionState,
} from '../shared/types'
import type { Result } from '../providers/types'

type Mode = 'loading' | 'settings' | 'create' | 'linked' | 'empty'

interface PatCache {
  notion: string | null
  azure: string | null
}

function deepLinkFor(fileKey: string, nodeId: string): string {
  // Figma node IDs use ':' internally (e.g. '1:2') but '-' in URLs (e.g. '1-2').
  const urlNodeId = nodeId.replace(/:/g, '-')
  return `https://www.figma.com/design/${fileKey}/?node-id=${encodeURIComponent(urlNodeId)}`
}

/**
 * Azure boardId is "org|project|workItemType" — pull the WIT out for CreateView.
 * Other providers (Notion) return undefined.
 */
function workItemTypeFor(providerId: ProviderId, boardId: string): string | undefined {
  if (providerId !== 'azure') return undefined
  const parts = boardId.split('|')
  return parts[2]
}

export function App() {
  const sandbox = useSandbox()
  const [mode, setMode] = useState<Mode>('loading')
  const [fileConfig, setFileConfig] = useState<FileConfig | null>(null)
  const [pats, setPats] = useState<PatCache>({ notion: null, azure: null })
  const [thumb, setThumb] = useState<Uint8Array | null>(null)
  const [thumbOversized, setThumbOversized] = useState(false)
  // Explicit override — when the user clicks the settings cog, we want to show
  // Settings even though a valid fileConfig exists.
  const [forceSettings, setForceSettings] = useState(false)
  // The id of the most recently-created ticket, used by LinkedView to show a
  // "just created" success banner. Cleared when selection changes.
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null)
  // Set to the just-created ticket id when its thumbnail upload failed, so
  // LinkedView can show a "thumbnail not attached" warning.
  const [attachmentFailedId, setAttachmentFailedId] = useState<string | null>(null)

  const [aiProvider, setAiProvider] = useState<'anthropic' | 'openai' | 'off'>('off')
  const [aiKey, setAiKey] = useState('')

  // Load file config + persisted PATs once on mount.
  useEffect(() => {
    void (async () => {
      const cfgRes = await sandbox.request({ type: 'get-file-config' })
      const cfg =
        cfgRes.type === 'file-config' ? cfgRes.config : null
      setFileConfig(cfg)
      const [notionPat, azurePat] = await Promise.all([
        sandbox.request({ type: 'get-pat', providerId: 'notion' }),
        sandbox.request({ type: 'get-pat', providerId: 'azure' }),
      ])
      setPats({
        notion: notionPat.type === 'pat' ? notionPat.pat : null,
        azure: azurePat.type === 'pat' ? azurePat.pat : null,
      })
      const aiCfg = await getAiConfig()
      if (aiCfg) {
        setAiProvider(aiCfg.provider)
        setAiKey(aiCfg.key)
      }
      setMode(cfg ? selectMode(sandbox.selection) : 'settings')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clear the "just created" banner when the user selects a different node.
  // Keyed on nodeId so it survives the same-node refresh after create.
  const selectedNodeId =
    sandbox.selection.kind === 'single' ? sandbox.selection.nodeId : null
  useEffect(() => {
    setJustCreatedId(null)
    setAttachmentFailedId(null)
  }, [selectedNodeId])

  // React to selection changes when configured.
  useEffect(() => {
    if (!fileConfig) return
    setMode(selectMode(sandbox.selection))
    setThumb(null)
    setThumbOversized(false)
    if (sandbox.selection.kind !== 'single' || sandbox.selection.link !== null) return
    let cancelled = false
    const nodeId = sandbox.selection.nodeId
    void (async () => {
      const res = await sandbox.request({ type: 'export-thumbnail', nodeId })
      if (cancelled) return
      if (res.type === 'thumbnail') {
        setThumb(res.image)
        setThumbOversized(res.oversized)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sandbox.selection, fileConfig, sandbox])

  const onSaveSettings = useCallback(
    (payload: { providerId: ProviderId; pat: string; config: FileConfig }) => {
      setPats((p) => ({ ...p, [payload.providerId]: payload.pat }))
      setFileConfig(payload.config)
      void sandbox.request({ type: 'set-file-config', config: payload.config })
      void sandbox.request({
        type: 'set-pat',
        providerId: payload.providerId,
        pat: payload.pat,
      })
      setForceSettings(false)
      setMode(selectMode(sandbox.selection))
    },
    [sandbox],
  )

  const onAiChange = useCallback(
    async (next: { provider: 'anthropic' | 'openai' | 'off'; key: string }) => {
      setAiProvider(next.provider)
      setAiKey(next.key)
      if (next.provider === 'off' || next.key === '') {
        await clearAiConfig()
      } else {
        await setAiConfig({ provider: next.provider, key: next.key })
      }
    },
    [],
  )

  const onUnlink = useCallback(async () => {
    if (sandbox.selection.kind !== 'single') return
    await sandbox.request({
      type: 'clear-ticket-link',
      nodeId: sandbox.selection.nodeId,
    })
    // pluginData writes don't fire selectionchange — refresh manually so the
    // UI flips from LinkedView back to CreateView.
    await sandbox.request({ type: 'get-selection-state' })
  }, [sandbox])

  const onOpenTicket = useCallback(
    (url: string) => {
      void sandbox.request({ type: 'open-external', url })
    },
    [sandbox],
  )

  const onFocusNode = useCallback(() => {
    if (sandbox.selection.kind !== 'single') return
    void sandbox.request({
      type: 'focus-node',
      nodeId: sandbox.selection.nodeId,
    })
  }, [sandbox])

  const onCreate = useCallback(
    async (input: TicketInput): Promise<Result<unknown>> => {
      if (!fileConfig) return { ok: false, reason: 'unknown', status: 0 }
      const pat = pats[fileConfig.providerId]
      if (!pat) return { ok: false, reason: 'auth_failed', status: 401 }
      const provider = getProvider(fileConfig.providerId)
      const created = await provider.createTicket(pat, fileConfig.boardId, input)
      if (!created.ok) return created
      let attachmentOk = true
      if (sandbox.selection.kind === 'single' && thumb) {
        const up = await provider.uploadAttachment(
          pat,
          { id: created.value.id, boardId: fileConfig.boardId },
          thumb,
          'thumbnail.png',
        )
        if (!up.ok) {
          attachmentOk = false
          console.warn(
            'figma-tickets: thumbnail upload failed',
            up.reason,
            up.status,
          )
        }
      }
      const link: TicketLink = {
        id: created.value.id,
        url: created.value.url,
        providerId: fileConfig.providerId,
        createdAt: new Date().toISOString(),
      }
      if (sandbox.selection.kind === 'single') {
        await sandbox.request({
          type: 'write-ticket-link',
          nodeId: sandbox.selection.nodeId,
          link,
        })
        // Mark this link as "just created" BEFORE refreshing selection so the
        // success banner is visible on the very first LinkedView render.
        setJustCreatedId(link.id)
        setAttachmentFailedId(attachmentOk ? null : link.id)
        // pluginData writes don't fire selectionchange — refresh manually so
        // the UI flips from CreateView to LinkedView.
        await sandbox.request({ type: 'get-selection-state' })
      }
      return { ok: true, value: created.value, status: created.status }
    },
    [fileConfig, pats, sandbox, thumb],
  )

  const testAuth = useMemo(
    () =>
      (providerId: ProviderId, pat: string) =>
        getProvider(providerId).testAuth(pat),
    [],
  )
  const listBoards = useMemo(
    () =>
      (providerId: ProviderId, pat: string) =>
        getProvider(providerId).listBoards(pat),
    [],
  )
  const getFieldSchema = useMemo(
    () =>
      (providerId: ProviderId, boardId: string) => {
        const pat = pats[providerId]
        if (!pat) return Promise.resolve({ ok: false, reason: 'auth_failed', status: 401 } as Result<never>)
        return getProvider(providerId).getFieldSchema(pat, boardId)
      },
    [pats],
  )

  const openSettings = () => setForceSettings(true)

  if (mode === 'loading') return <div>Loading…</div>

  if (forceSettings || !fileConfig || mode === 'settings') {
    return (
      <SettingsView
        initialProviderId={fileConfig?.providerId ?? null}
        initialPat={fileConfig ? pats[fileConfig.providerId] ?? '' : ''}
        initialFileKey={fileConfig?.fileKey ?? ''}
        initialBoard={
          fileConfig
            ? { id: fileConfig.boardId, label: fileConfig.boardLabel }
            : null
        }
        testAuth={testAuth}
        listBoards={listBoards}
        onSave={onSaveSettings}
        onCancel={fileConfig ? () => setForceSettings(false) : undefined}
        aiProvider={aiProvider}
        aiKey={aiKey}
        onAiChange={onAiChange}
      />
    )
  }

  if (mode === 'empty' || sandbox.selection.kind !== 'single') {
    return (
      <div>
        <ViewHeader title="Tickets" onOpenSettings={openSettings} />
        <p>Select a single frame or section to create a ticket.</p>
      </div>
    )
  }

  if (sandbox.selection.link) {
    return (
      <LinkedView
        link={sandbox.selection.link}
        justCreated={justCreatedId === sandbox.selection.link.id}
        attachmentFailed={attachmentFailedId === sandbox.selection.link.id}
        onOpen={onOpenTicket}
        onFocus={onFocusNode}
        onUnlink={onUnlink}
        onOpenSettings={openSettings}
      />
    )
  }

  return (
    <CreateView
      providerId={fileConfig.providerId}
      boardId={fileConfig.boardId}
      boardLabel={fileConfig.boardLabel}
      nodeName={sandbox.selection.nodeName}
      thumbnail={thumb}
      thumbnailOversized={thumbOversized}
      workItemType={workItemTypeFor(fileConfig.providerId, fileConfig.boardId)}
      figmaDeepLink={deepLinkFor(fileConfig.fileKey, sandbox.selection.nodeId)}
      figmaLinkLabel={sandbox.selection.nodeName}
      getFieldSchema={getFieldSchema}
      onCreate={onCreate}
      onOpenSettings={openSettings}
    />
  )
}

function selectMode(selection: SelectionState): Mode {
  if (selection.kind === 'none' || selection.kind === 'multi' || selection.kind === 'unsupported') {
    return 'empty'
  }
  return selection.link ? 'linked' : 'create'
}
