import React, { useState } from 'react'
import { Button } from '../components/Button'
import { ErrorBanner } from '../components/ErrorBanner'
import { Input } from '../components/Input'
import type { Board, FileConfig, ProviderId } from '../../shared/types'
import type { Result } from '../../providers/types'

interface Props {
  initialProviderId: ProviderId | null
  initialPat: string
  testAuth: (providerId: ProviderId, pat: string) => Promise<Result<true>>
  listBoards: (providerId: ProviderId, pat: string) => Promise<Result<Board[]>>
  onSave: (payload: { providerId: ProviderId; pat: string; config: FileConfig }) => void
}

type Phase = 'idle' | 'testing' | 'loaded' | 'error'

function reasonToMessage(reason: string): string {
  if (reason === 'auth_failed') return "Your token isn't working — re-enter it."
  if (reason === 'network_error') return 'Network error — check your connection.'
  if (reason === 'rate_limited') return 'Rate limited — wait a moment and retry.'
  if (reason === 'server_error') return 'Server error — try again shortly.'
  return 'Something went wrong.'
}

export function SettingsView({
  initialProviderId,
  initialPat,
  testAuth,
  listBoards,
  onSave,
}: Props) {
  const [providerId, setProviderId] = useState<ProviderId | null>(initialProviderId)
  const [pat, setPat] = useState(initialPat)
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [boards, setBoards] = useState<Board[]>([])
  const [boardId, setBoardId] = useState<string>('')

  async function onTest() {
    if (!providerId || !pat) return
    setPhase('testing')
    setErrorMessage(null)
    try {
      const auth = await testAuth(providerId, pat)
      if (!auth.ok) {
        setPhase('error')
        setErrorMessage(reasonToMessage(auth.reason))
        return
      }
      const boardsRes = await listBoards(providerId, pat)
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
    if (!providerId || !pat || !boardId) return
    const board = boards.find((b) => b.id === boardId)
    if (!board) return
    onSave({
      providerId,
      pat,
      config: { providerId, boardId: board.id, boardLabel: board.label },
    })
  }

  const canTest = !!providerId && pat.length > 0 && phase !== 'testing'

  return (
    <div>
      <h2>Settings</h2>
      {errorMessage && <ErrorBanner message={errorMessage} />}

      <fieldset className="radio-group">
        <legend>Provider</legend>
        <label className="radio-row">
          <input
            type="radio"
            name="provider"
            value="notion"
            checked={providerId === 'notion'}
            onChange={() => setProviderId('notion')}
          />
          Notion
        </label>
        <label className="radio-row">
          <input
            type="radio"
            name="provider"
            value="azure"
            checked={providerId === 'azure'}
            onChange={() => setProviderId('azure')}
          />
          Azure DevOps
        </label>
      </fieldset>

      <Input
        label={
          providerId === 'azure'
            ? 'Personal access token (format: org|token)'
            : 'Personal access token'
        }
        value={pat}
        onChange={setPat}
        type="password"
        placeholder={providerId === 'azure' ? 'myorg|abcd…' : 'secret_…'}
      />

      <div className="row">
        <Button variant="primary" disabled={!canTest} onClick={onTest}>
          {phase === 'testing' ? 'Testing…' : 'Test connection'}
        </Button>
      </div>

      {phase === 'loaded' && boards.length === 0 && providerId === 'notion' && (
        <p style={{ marginTop: 10 }}>
          No databases found. In Notion, open your target database → ••• → Connections
          and share each target database with this integration.
        </p>
      )}

      {phase === 'loaded' && boards.length > 0 && (
        <div className="field" style={{ marginTop: 10 }}>
          <label htmlFor="board">Board</label>
          <select
            id="board"
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 10 }}>
            <Button variant="primary" onClick={onClickSave}>
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
