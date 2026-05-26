import React, { useMemo, useState } from 'react'
import { Button } from '../components/Button'
import { ErrorBanner } from '../components/ErrorBanner'
import { Input } from '../components/Input'
import type { Board, FileConfig, ProviderId } from '../../shared/types'
import type { Result } from '../../providers/types'
import { reasonToMessage } from '../reasonMessage'

interface Props {
  initialProviderId: ProviderId | null
  initialPat: string
  initialFileKey: string
  /**
   * The previously-saved board (id + label). When provided, we seed the boards
   * list with this single entry so the Project + Work item type dropdowns show
   * the saved selection immediately, without forcing the user to re-test the
   * connection. Clicking "Test connection" still works to refresh the full list.
   */
  initialBoard?: { id: string; label: string } | null
  testAuth: (providerId: ProviderId, pat: string) => Promise<Result<true>>
  listBoards: (providerId: ProviderId, pat: string) => Promise<Result<Board[]>>
  onSave: (payload: { providerId: ProviderId; pat: string; config: FileConfig }) => void
  // Present only when a previous config exists, so users can back out of editing
  // settings without losing their existing config.
  onCancel?: () => void
  aiProvider: 'anthropic' | 'openai' | 'azure-openai' | 'off'
  aiKey: string
  aiEndpoint: string
  onAiChange: (next: {
    provider: 'anthropic' | 'openai' | 'azure-openai' | 'off'
    key: string
    endpoint?: string
  }) => void
}

/**
 * Parses the file key from a Figma URL like:
 *   https://www.figma.com/design/zmJ9R5ZqtHnFWrRD72cKYT/Untitled?node-id=...
 *   https://www.figma.com/file/abc123/My-File
 *   https://www.figma.com/board/xyz789/Board   (FigJam)
 * Returns null if the input doesn't look like a Figma URL.
 */
export function parseFileKey(input: string): string | null {
  const m = input.match(/figma\.com\/(?:file|design|board|slides|make)\/([A-Za-z0-9]+)/i)
  return m?.[1] ?? null
}

/**
 * Parses an Azure stored PAT (`org|token`) into the visible fields used in this view.
 * Notion PATs pass through unchanged in the `token` field.
 */
function splitInitialPat(providerId: ProviderId | null, pat: string): { org: string; token: string } {
  if (providerId !== 'azure') return { org: '', token: pat }
  const idx = pat.indexOf('|')
  if (idx < 0) return { org: '', token: pat }
  return { org: pat.slice(0, idx), token: pat.slice(idx + 1) }
}

function isLikelyAzureOpenAiEndpoint(v: string): boolean {
  try {
    const url = new URL(v)
    return url.protocol === 'https:' && url.hostname.endsWith('.openai.azure.com')
  } catch {
    return false
  }
}

function hasApiVersionParam(v: string): boolean {
  try {
    return new URL(v).searchParams.has('api-version')
  } catch {
    return false
  }
}

type Phase = 'idle' | 'testing' | 'loaded' | 'error'

export function SettingsView({
  initialProviderId,
  initialPat,
  initialFileKey,
  initialBoard,
  testAuth,
  listBoards,
  onSave,
  onCancel,
  aiProvider,
  aiKey,
  aiEndpoint,
  onAiChange,
}: Props) {
  // Listing is Azure-only. The Notion provider still ships in the bundle so
  // existing file configs keep working, but the picker is hidden.
  const providerId: ProviderId = 'azure'
  const initialSplit = splitInitialPat(initialProviderId, initialPat)
  const [org, setOrg] = useState(initialSplit.org)
  const [token, setToken] = useState(initialSplit.token)
  // The phase starts at 'loaded' when we have a saved board to display; the
  // user can still re-run Test connection to refresh.
  const [phase, setPhase] = useState<Phase>(initialBoard ? 'loaded' : 'idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Seed boards from the saved selection so dropdowns show the right value
  // immediately. Test connection replaces this with the fresh list.
  const [boards, setBoards] = useState<Board[]>(initialBoard ? [initialBoard] : [])
  const [boardId, setBoardId] = useState<string>(initialBoard?.id ?? '')
  const [fileUrl, setFileUrl] = useState(
    initialFileKey ? `https://www.figma.com/design/${initialFileKey}/` : '',
  )
  const parsedFileKey = parseFileKey(fileUrl)

  // The string the Azure provider expects: `org|token`.
  const composedPat = `${org.trim()}|${token}`

  // For Azure: derive Project list + Type list from the boards array. Each
  // board.id has the shape `org|project|workItemType`.
  const { projects, workItemTypesForProject, selectedProject, selectedWorkItemType } =
    useMemo(() => {
      if (boards.length === 0) {
        return {
          projects: [] as string[],
          workItemTypesForProject: [] as string[],
          selectedProject: '',
          selectedWorkItemType: '',
        }
      }
      const projSet = new Set<string>()
      for (const b of boards) {
        const [, p] = b.id.split('|')
        if (p) projSet.add(p)
      }
      const projs = Array.from(projSet).sort()
      const [, currentProj, currentWit] = boardId.split('|')
      const witForProj = boards
        .filter((b) => b.id.split('|')[1] === currentProj)
        .map((b) => b.id.split('|')[2] ?? '')
        .filter((w) => w.length > 0)
      return {
        projects: projs,
        workItemTypesForProject: witForProj,
        selectedProject: currentProj ?? '',
        selectedWorkItemType: currentWit ?? '',
      }
    }, [boards, boardId])

  function onChangeProject(nextProject: string) {
    // Pick the first work item type available for that project.
    const firstBoard = boards.find((b) => b.id.split('|')[1] === nextProject)
    if (firstBoard) setBoardId(firstBoard.id)
  }

  function onChangeWorkItemType(nextWit: string) {
    const next = boards.find(
      (b) => b.id.split('|')[1] === selectedProject && b.id.split('|')[2] === nextWit,
    )
    if (next) setBoardId(next.id)
  }

  async function onTest() {
    if (!org.trim() || !token) return
    setPhase('testing')
    setErrorMessage(null)
    try {
      const auth = await testAuth(providerId, composedPat)
      if (!auth.ok) {
        setPhase('error')
        setErrorMessage(reasonToMessage(auth.reason))
        return
      }
      const boardsRes = await listBoards(providerId, composedPat)
      if (!boardsRes.ok) {
        setPhase('error')
        setErrorMessage(reasonToMessage(boardsRes.reason))
        return
      }
      setBoards(boardsRes.value)
      setBoardId(boardsRes.value[0]?.id ?? '')
      setPhase('loaded')
    } catch (e) {
      setPhase('error')
      setErrorMessage(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  function onClickSave() {
    if (!composedPat || !boardId || !parsedFileKey) return
    const board = boards.find((b) => b.id === boardId)
    if (!board) return
    onSave({
      providerId,
      pat: composedPat,
      config: {
        providerId,
        boardId: board.id,
        boardLabel: board.label,
        fileKey: parsedFileKey,
      },
    })
  }

  const credentialsComplete = org.trim().length > 0 && token.length > 0
  const canTest = credentialsComplete && phase !== 'testing'
  const canSave = !!boardId && !!parsedFileKey

  return (
    <div>
      <h2>Settings</h2>

      {errorMessage && <ErrorBanner message={errorMessage} />}

      <Input
        label="Azure DevOps organization"
        value={org}
        onChange={setOrg}
        placeholder="e.g. myorg"
      />
      <Input
        label="Personal access token"
        value={token}
        onChange={setToken}
        type="password"
        placeholder="paste your PAT"
      />

      <div className="row" style={{ marginBottom: 12 }}>
        <Button variant="primary" disabled={!canTest} onClick={onTest}>
          {phase === 'testing' ? 'Testing…' : 'Test connection'}
        </Button>
      </div>

      {phase === 'loaded' && boards.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div className="field">
            <label htmlFor="project">Project</label>
            <select
              id="project"
              value={selectedProject}
              onChange={(e) => onChangeProject(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="wit">Work item type</label>
            <select
              id="wit"
              value={selectedWorkItemType}
              onChange={(e) => onChangeWorkItemType(e.target.value)}
            >
              {workItemTypesForProject.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Figma file URL"
            value={fileUrl}
            onChange={setFileUrl}
            placeholder="https://www.figma.com/design/abc123/My-File"
          />
          {fileUrl.length > 0 && !parsedFileKey && (
            <p style={{ marginTop: -6, marginBottom: 10, opacity: 0.7 }}>
              That doesn't look like a Figma URL. Copy this file's URL from your browser
              address bar.
            </p>
          )}
          {fileUrl.length === 0 && (
            <p style={{ marginTop: -6, marginBottom: 10, opacity: 0.7 }}>
              Copy this file's URL from your browser address bar and paste it here.
            </p>
          )}

          <div className="row">
            <Button variant="primary" disabled={!canSave} onClick={onClickSave}>
              Save
            </Button>
            {onCancel && <Button onClick={onCancel}>Cancel</Button>}
          </div>
        </div>
      )}

      <fieldset style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--figma-color-border, #444)' }}>
        <legend>AI Draft (optional)</legend>
        <p style={{ marginTop: 0, marginBottom: 8, opacity: 0.75, fontSize: '12px' }}>
          Disabled by default. Sends frame name, native annotations, and visible
          text layer copy to your chosen provider using your own API key. A
          downscaled screenshot of the frame is also sent by default; turn off
          "Include image" per draft to send text only. No telemetry.
        </p>
        <div className="field">
          <label htmlFor="ai-provider">Provider</label>
          <select
            id="ai-provider"
            value={aiProvider}
            onChange={(e) =>
              onAiChange({
                provider: e.target.value as
                  | 'anthropic'
                  | 'openai'
                  | 'azure-openai'
                  | 'off',
                key: aiKey,
                endpoint: aiEndpoint,
              })
            }
          >
            <option value="off">Off</option>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="azure-openai">Azure OpenAI</option>
          </select>
        </div>
        {aiProvider === 'azure-openai' && (
          <>
            <Input
              label="Endpoint URL"
              value={aiEndpoint}
              onChange={(v) =>
                onAiChange({ provider: aiProvider, key: aiKey, endpoint: v })
              }
              placeholder="https://mycorp.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-10-21"
            />
            {aiEndpoint.length > 0 && !isLikelyAzureOpenAiEndpoint(aiEndpoint) && (
              <p style={{ marginTop: -6, marginBottom: 10, opacity: 0.7 }}>
                That doesn't look like an Azure OpenAI URL. It should start with{' '}
                <code>https://</code> and the host should end with{' '}
                <code>.openai.azure.com</code>.
              </p>
            )}
            {aiEndpoint.length > 0 &&
              isLikelyAzureOpenAiEndpoint(aiEndpoint) &&
              !hasApiVersionParam(aiEndpoint) && (
                <p style={{ marginTop: -6, marginBottom: 10, opacity: 0.7 }}>
                  Missing <code>?api-version=…</code>. Azure OpenAI requires it —
                  add e.g. <code>?api-version=2024-10-21</code> to the end of the
                  URL.
                </p>
              )}
          </>
        )}
        {aiProvider !== 'off' && (
          <Input
            label="API key"
            value={aiKey}
            onChange={(v) =>
              onAiChange({ provider: aiProvider, key: v, endpoint: aiEndpoint })
            }
            type="password"
            placeholder={
              aiProvider === 'anthropic'
                ? 'sk-ant-…'
                : aiProvider === 'azure-openai'
                  ? 'paste your Azure OpenAI key'
                  : 'sk-…'
            }
          />
        )}
      </fieldset>
    </div>
  )
}
