import { describe, expect, it } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_MODEL, parseRequest, proposeEdits } from './proposeEdits'
import type { CreateMessage } from './proposeEdits'
import { sampleEstate } from '../src/model/sampleEstate'

type Message = Anthropic.Beta.Messages.BetaMessage
type Block = Message['content'][number]
type Params = Parameters<CreateMessage>[0]

const reply = (content: unknown[], stop_reason: Message['stop_reason'] = 'end_turn') =>
  ({ id: 'msg', type: 'message', role: 'assistant', model: DEFAULT_MODEL, content: content as Block[], stop_reason, stop_sequence: null, usage: {} }) as unknown as Message
const tool = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input })
const text = (t: string) => ({ type: 'text', text: t })

/** A fake Claude that answers from a script and records what it was sent. */
function scripted(...responses: Message[]) {
  const calls: Params[] = []
  const create: CreateMessage = async params => { calls.push(structuredClone(params)); return responses[calls.length - 1] ?? reply([text('done')]) }
  return { create, calls }
}

const request = (r: string) => ({ estate: sampleEstate, request: r, history: [] })

describe('proposeEdits', () => {
  it('turns tool calls into edits in inches and returns the closing reply', async () => {
    const { create, calls } = scripted(
      reply([tool('t1', 'moveBuilding', { buildingId: 'forestry-shop', eastFt: 100, northFt: 0 })], 'tool_use'),
      reply([text('Moved the forestry shop 100 ft east. No checks changed.')]),
    )
    const out = await proposeEdits(create, request('move the forestry shop 100 feet east'))
    expect(out).toEqual({ ok: true, ops: [{ op: 'moveBuilding', buildingId: 'forestry-shop', dx: 1200, dy: 0 }], reply: 'Moved the forestry shop 100 ft east. No checks changed.' })
    expect(calls[0].model).toBe('claude-sonnet-5-5')
    expect(calls[0].tools?.every(t => 'strict' in t && t.strict)).toBe(true)
    const results = calls[1].messages.at(-1)!.content as Anthropic.Beta.Messages.BetaContentBlockParam[]
    expect(results[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1', content: 'Applied to the preview.' })
    expect(results.at(-1)).toMatchObject({ type: 'text' })
  })

  it('rejects a whole round when one call fails, then accepts the corrected set', async () => {
    const { create, calls } = scripted(
      reply([
        tool('a', 'moveBuilding', { buildingId: 'fuel', eastFt: 10, northFt: 0 }),
        tool('b', 'removeRoom', { roomId: 'no-such-room' }),
      ], 'tool_use'),
      reply([tool('c', 'moveBuilding', { buildingId: 'fuel', eastFt: 10, northFt: 0 })], 'tool_use'),
      reply([text('Moved the fuel island.')]),
    )
    const out = await proposeEdits(create, request('move fuel and remove a room'))
    expect(out.ok && out.ops).toEqual([{ op: 'moveBuilding', buildingId: 'fuel', dx: 120, dy: 0 }])
    const firstResults = calls[1].messages.at(-1)!.content as Anthropic.Beta.Messages.BetaToolResultBlockParam[]
    expect(firstResults.map(r => r.is_error)).toEqual([true, true])
    expect(firstResults[1].content).toMatch(/no-such-room/)
  })

  it('reports newly failing checks back to Claude', async () => {
    const { create, calls } = scripted(
      reply([tool('t', 'moveBuilding', { buildingId: 'fuel', eastFt: -3500, northFt: 3300 })], 'tool_use'),
      reply([text('Moved it, but the separation check now fails.')]),
    )
    await proposeEdits(create, request('move the forestry shop next to the house'))
    const blocks = calls[1].messages.at(-1)!.content as { type: string; text?: string }[]
    expect(blocks.find(b => b.type === 'text')?.text).toMatch(/1\/4 mile.*pass -> fail/)
  })

  it('uses the configured model, adding the refusal fallback only where supported', async () => {
    const a = scripted(reply([text('ok')]))
    await proposeEdits(a.create, request('x'), 'claude-opus-5-5')
    expect(a.calls[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default' })
    const b = scripted(reply([text('ok')]))
    await proposeEdits(b.create, request('x'), 'claude-haiku-5-5')
    expect(b.calls[0].model).toBe('claude-haiku-5-5')
    expect(b.calls[0]).not.toHaveProperty('fallbacks')
  })

  it('tells Claude what a widened kitchen collides with, then accepts a valid fix', async () => {
    const { create, calls } = scripted(
      reply([tool('a', 'resizeRoom', { roomId: 'kitchen', widthFt: 40, depthFt: 28, anchor: 'e' })], 'tool_use'),
      reply([
        tool('b', 'resizeRoom', { roomId: 'kitchen', widthFt: 40, depthFt: 28, anchor: 'e' }),
        tool('c', 'resizeRoom', { roomId: 'dining', widthFt: 11, depthFt: 28, anchor: 'w' }),
        tool('d', 'resizeOpening', { openingId: 'dining-glass', widthFt: 8, heightFt: 7, sillFt: 1.5 }),
        tool('e', 'moveOpening', { openingId: 'dining-glass', side: 's', offsetFt: 5.5 }),
      ], 'tool_use'),
      reply([text('Widened the kitchen 7 ft west and took the space from the dining room.')]),
    )
    const out = await proposeEdits(create, request('Make the kitchen 7 feet wider.'))
    const first = calls[1].messages.at(-1)!.content as Anthropic.Beta.Messages.BetaToolResultBlockParam[]
    expect(first[0]).toMatchObject({ is_error: true })
    expect(first[0].content).toContain('Formal dining (dining) and Eat-in party kitchen, island, breakfast bay (kitchen) would overlap by 7 ft × 28 ft')
    expect(out.ok && out.ops.map(o => o.op)).toEqual(['resizeRoom', 'resizeRoom', 'resizeOpening', 'moveOpening'])
  })

  it('gives the set-level error to every call when the set as a whole collides', async () => {
    const { create, calls } = scripted(
      reply([tool('a', 'renameRoom', { roomId: 'kitchen', name: 'Kitchen' }), tool('b', 'resizeRoom', { roomId: 'kitchen', widthFt: 60, depthFt: 24, anchor: 'w' })], 'tool_use'),
      reply([text('The kitchen cannot grow without taking space from the great room. Which room should give it up?')]),
    )
    const out = await proposeEdits(create, request('Make the kitchen 10 feet wider.'))
    const results = calls[1].messages.at(-1)!.content as Anthropic.Beta.Messages.BetaToolResultBlockParam[]
    expect(results.every(r => r.is_error && /would overlap/.test(String(r.content)))).toBe(true)
    expect(out).toEqual({ ok: true, ops: [], reply: 'The kitchen cannot grow without taking space from the great room. Which room should give it up?' })
  })

  it('returns a question with no edits', async () => {
    const { create } = scripted(reply([text('Which shop do you mean?')]))
    expect(await proposeEdits(create, request('move the shop'))).toEqual({ ok: true, ops: [], reply: 'Which shop do you mean?' })
  })

  it('handles a refusal without returning edits', async () => {
    const { create } = scripted(reply([], 'refusal'))
    expect((await proposeEdits(create, request('x'))).ok).toBe(false)
  })

  it('sends earlier turns as plain text, starting with the owner', async () => {
    const { create, calls } = scripted(reply([text('ok')]))
    await proposeEdits(create, { estate: sampleEstate, request: 'again', history: [{ role: 'assistant', text: 'hi' }, { role: 'user', text: 'move fuel' }, { role: 'assistant', text: 'Moved it.' }] })
    expect(calls[0].messages.map(m => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(calls[0].messages[2].content).toMatch(/Current model:[\s\S]*Owner's request:\nagain/)
  })
})

describe('parseRequest', () => {
  it('rejects empty or malformed bodies', () => {
    expect(parseRequest(null).ok).toBe(false)
    expect(parseRequest({ request: '  ', estate: sampleEstate }).ok).toBe(false)
    expect(parseRequest({ request: 'hi', estate: {} }).ok).toBe(false)
    expect(parseRequest({ request: 'hi', estate: sampleEstate }).ok).toBe(true)
  })
})
