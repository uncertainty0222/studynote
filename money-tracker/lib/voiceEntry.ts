import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

const EntrySchema = z.object({
  understood: z.boolean(),
  direction: z.enum(['IN', 'OUT']),
  amount_vnd: z.number().int(),
  title_vi: z.string(),
  memo_ko: z.string(),
  date: z.string(),
  problem_ko: z.string(),
});
export type VoiceEntry = z.infer<typeof EntrySchema>;

const SYSTEM = `You turn one spoken note into one ledger entry for "Két Nana" (나나 금고): the shared household cash that Nana (the wife, Vietnamese) holds for the couple. Inhwa is the husband (Korean). The note was dictated by phone speech recognition, so words may be misheard; infer the intended meaning.

Direction, from the vault's point of view:
- IN: money goes into Nana's vault. Examples: Inhwa gives Nana money, tour income handed to Nana, cash exchanged and given to Nana.
- OUT: money leaves Nana's vault. Examples: Nana pays rent, buys formula/diapers/medicine for their baby Mango (준서), groceries, family dinners; Inhwa takes cash from Nana; money deposited to the office.

Amount: Vietnamese dong (VND), as an integer. Read Korean and Vietnamese number words: "백오십만 동" = 1500000, "삼십만" = 300000, "1.5 triệu" = 1500000, "500k" or "오백 케이" = 500000, "이백 오십" in a context of thousands = 250000. If the note gives the amount only in another currency, or gives no amount, set understood=false.

Fields:
- title_vi: a short, natural Vietnamese title Nana can read at a glance (under ~60 characters), e.g. "Inhwa đưa tiền tour cho Nana", "Tiền nhà tháng 12", "Sữa bột cho Mango".
- memo_ko: what Inhwa meant, in one clean Korean sentence, with misheard words fixed. Keep names, places, and reasons he mentioned.
- date: YYYY-MM-DD. Use today's date unless the note says otherwise ("어제", "지난 금요일", a specific day).
- understood: false only when the amount or what the money was for cannot be worked out. Then explain briefly in problem_ko (Korean) and fill the other fields with your best guess. Otherwise problem_ko is "".`;

export async function parseVoiceEntry(text: string, opts: { today: string; speaker: 'husband' | 'wife' }): Promise<VoiceEntry> {
  const client = new Anthropic();
  const speaker = opts.speaker === 'husband' ? 'Inhwa (husband)' : 'Nana (wife)';
  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(EntrySchema) },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Today: ${opts.today}\nSpeaker: ${speaker}\nSpoken note: ${text}` }],
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new Error('AI가 내용을 정리하지 못했어요');
  }
  return response.parsed_output;
}

export function todayInVietnam(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}
