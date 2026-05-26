import type { Board, FieldSchema, ProviderId, TicketInput } from '../shared/types'

export type NormalizedReason =
  | 'auth_failed'
  | 'not_found'
  | 'rate_limited'
  | 'server_error'
  | 'network_error'
  | 'unknown'

export type Result<T> =
  | { ok: true; value: T; status: number }
  | { ok: false; reason: NormalizedReason; status: number; detail?: string }

export interface UploadResult {
  supported: boolean
}

export interface TicketProvider {
  id: ProviderId
  displayName: string
  testAuth(pat: string): Promise<Result<true>>
  listBoards(pat: string): Promise<Result<Board[]>>
  getFieldSchema(pat: string, boardId: string): Promise<Result<FieldSchema>>
  createTicket(
    pat: string,
    boardId: string,
    ticket: TicketInput,
  ): Promise<
    Result<{
      id: string
      url: string
      /**
       * Present only when `ticket.inlineImage` was supplied. `false` means the
       * inline-image upload failed and the ticket was created without it, so the
       * UI can warn the user. Omitted/undefined when no inline image was requested.
       */
      inlineImageAttached?: boolean
    }>
  >
  uploadAttachment(
    pat: string,
    ticketRef: { id: string; boardId: string },
    image: Uint8Array,
    fileName: string,
  ): Promise<Result<UploadResult>>
}
