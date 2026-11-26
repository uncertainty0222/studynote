import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

const EntrySchema = z.object({
  understood: z.boolean(),
  direction: z.enum(['IN', 'OUT']),
  amount_vnd: z.number().int(),
  title: z.string(),
  memo: z.string(),
  date: z.string(),
  problem: z.string(),
});
export type VoiceEntry = z.infer<typeof EntrySchema>;

const SYSTEM = `You turn one spoken note into one ledger entry for "Két Nana" (나나 금고): the shared household cash that Nana (the wife, Vietnamese) holds for the couple. Inhwa is the husband (Korean). Either of them may record a note, Inhwa in Korean and Nana in Vietnamese. The note was dictated by phone speech recognition, so words may be misheard; infer the intended meaning.

Direction, from the vault's point of view:
- IN: money goes into Nana's vault. Examples: Inhwa gives Nana money, tour income handed to Nana, cash exchanged and given to Nana.
- OUT: money leaves Nana's vault. Examples: Nana pays rent, buys formula/diapers/medicine for their baby Mango (준서), groceries, family dinners; Inhwa takes cash from Nana; money deposited to the office.

Amount: Vietnamese dong (VND), as an integer. Read Korean and Vietnamese number words: "백오십만 동" = 1500000, "삼십만" = 300000, "1.5 triệu" / "một triệu rưỡi" = 1500000, "500k" / "năm trăm nghìn" / "오백 케이" = 500000, "이백 오십" in a context of thousands = 250000. If the note gives the amount only in another currency, or gives no amount, set understood=false.

The entry is read by the partner of whoever spoke, so the title goes in the partner's language and the memo keeps the speaker's own words:
- title: a short, natural title (under ~60 characters) in the TITLE LANGUAGE named in the request, readable at a glance. Vietnamese examples: "Inhwa đưa tiền tour cho Nana", "Tiền nhà tháng 12", "Sữa bột cho Mango". Korean examples: "망고 분유", "12월 집세", "인화가 현금 가져감".
- memo: what the speaker meant, in one clean sentence in the SPEAKER'S LANGUAGE, with misheard words fixed. Keep names, places, and reasons mentioned.
- date: YYYY-MM-DD. Use today's date unless the note says otherwise ("어제", "hôm qua", a weekday, a specific day).
- understood: false only when the amount or what the money was for cannot be worked out. Then explain briefly in problem, in the speaker's language, and fill the other fields with your best guess. Otherwise problem is "".`;

export async function parseVoiceEntry(text: string, opts: { today: string; speaker: 'husband' | 'wife' }): Promise<VoiceEntry> {
  const client = new Anthropic();
  const who = opts.speaker === 'husband'
    ? 'Speaker: Inhwa (husband). Speaker\'s language: Korean. TITLE LANGUAGE: Vietnamese (for Nana).'
    : 'Speaker: Nana (wife). Speaker\'s language: Vietnamese. TITLE LANGUAGE: Korean (for Inhwa).';
  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(EntrySchema) },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Today: ${opts.today}\n${who}\nSpoken note: ${text}` }],
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new Error('AI could not structure the note');
  }
  return response.parsed_output;
}

export function todayInVietnam(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}
