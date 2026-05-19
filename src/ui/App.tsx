import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSandbox } from './hooks/useSandbox'
import { SettingsView } from './views/SettingsView'
import { CreateView } from './views/CreateView'
import { LinkedView } from './views/LinkedView'
import { getProvider } from '../providers/registry'
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

function deepLinkFor(nodeId: string): string {
  // Figma deep link via plugin runtime is not directly available in UI iframe;
  // we leave a placeholder URL. The sandbox could supply this; for v1 we use
  // a generic Figma URL that surfaces the node id.
  return `https://www.figma.com/file/?node-id=${encodeURIComponent(nodeId)}`
}

export function App() {
  const sandbox = useSandbox()
  const [mode, setMode] = useState<Mode>('loading')
  const [fileConfig, setFileConfig] = useState<FileConfig | null>(null)
  const [pats, setPats] = useState<PatCache>({ notion: null, azure: null })
  const [thumb, setThumb] = useState<Uint8Array | null>(null)

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
      setMode(cfg ? selectMode(sandbox.selection) : 'settings')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // React to selection changes when configured.
  useEffect(() => {
    if (!fileConfig) return
    setMode(selectMode(sandbox.selection))
    setThumb(null)
    if (sandbox.selection.kind === 'single' && sandbox.selection.link === null) {
      void (async () => {
        if (sandbox.selection.kind !== 'single') return
        const res = await sandbox.request({
          type: 'export-thumbnail',
          nodeId: sandbox.selection.nodeId,
        })
        if (res.type === 'thumbnail') setThumb(res.image)
      })()
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
      setMode(selectMode(sandbox.selection))
    },
    [sandbox],
  )

  const onUnlink = useCallback(() => {
    if (sandbox.selection.kind !== 'single') return
    void sandbox.request({
      type: 'clear-ticket-link',
      nodeId: sandbox.selection.nodeId,
    })
  }, [sandbox])

  const onOpenTicket = useCallback(
    (url: string) => {
      void sandbox.request({ type: 'open-external', url })
    },
    [sandbox],
  )

  const onCreate = useCallback(
    async (input: TicketInput): Promise<Result<unknown>> => {
      if (!fileConfig) return { ok: false, reason: 'unknown', status: 0 }
      const pat = pats[fileConfig.providerId]
      if (!pat) return { ok: false, reason: 'auth_failed', status: 401 }
      const provider = getProvider(fileConfig.providerId)
      const created = await provider.createTicket(pat, fileConfig.boardId, input)
      if (!created.ok) return created
      if (sandbox.selection.kind === 'single' && thumb) {
        await provider.uploadAttachment(
          pat,
          { id: created.value.id, boardId: fileConfig.boardId },
          thumb,
          'thumbnail.png',
        )
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

  if (mode === 'loading') return <div>Loading…</div>

  if (!fileConfig || mode === 'settings') {
    return (
      <SettingsView
        initialProviderId={fileConfig?.providerId ?? null}
        initialPat={fileConfig ? pats[fileConfig.providerId] ?? '' : ''}
        testAuth={testAuth}
        listBoards={listBoards}
        onSave={onSaveSettings}
      />
    )
  }

  if (mode === 'empty' || sandbox.selection.kind !== 'single') {
    return (
      <div>
        <h2>Tickets</h2>
        <p>Select a single frame or section to create a ticket.</p>
      </div>
    )
  }

  if (sandbox.selection.link) {
    return (
      <LinkedView
        link={sandbox.selection.link}
        onOpen={onOpenTicket}
        onUnlink={onUnlink}
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
      figmaDeepLink={deepLinkFor(sandbox.selection.nodeId)}
      getFieldSchema={getFieldSchema}
      onCreate={onCreate}
    />
  )
}

function selectMode(selection: SelectionState): Mode {
  if (selection.kind === 'none' || selection.kind === 'multi' || selection.kind === 'unsupported') {
    return 'empty'
  }
  return selection.link ? 'linked' : 'create'
}
