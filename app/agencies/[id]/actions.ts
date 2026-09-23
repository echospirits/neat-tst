'use server';

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '../../components/ActionForm';
import { requireUser } from '../../../lib/auth';
import { requireOrganizationContext } from '../../../lib/organizations';
import { isSupportedOperatingHoursText, OPERATING_HOURS_DAYS, type OperatingHoursDay } from '../../../lib/operatingHours';
import { prisma } from '../../../lib/prisma';
import { assertAccountResearchPilotEnabled } from '../../../lib/accountResearchOpenAI';
import { ACCOUNT_RESEARCH_PILOT_MODEL } from '../../../lib/accountResearchPilot';
import { normalizeUsState, US_STATES } from '../../../lib/usStates';

const hoursResearchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    exactLocation: { type: 'boolean' },
    matchedName: { type: 'string' },
    matchedAddress: { type: 'string' },
    sourceName: { type: 'string' },
    sourceUrl: { type: 'string' },
    schedule: {
      type: 'array',
      maxItems: 7,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { day: { type: 'string', enum: [...OPERATING_HOURS_DAYS] }, hours: { type: 'string' } },
        required: ['day', 'hours'],
      },
    },
  },
  required: ['exactLocation', 'matchedName', 'matchedAddress', 'sourceName', 'sourceUrl', 'schedule'],
} as const;

const addressAliases: Record<string, string> = {
  street: 'st', road: 'rd', avenue: 'ave', boulevard: 'blvd', highway: 'hwy', drive: 'dr', lane: 'ln', route: 'rt',
};
const normalizeIdentity = (value: string) => value.toLowerCase()
  .replace(/\b(?:street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|highway|hwy\.?|drive|dr\.?|lane|ln\.?|route|rt\.?)\b/g, (word) => addressAliases[word.replace(/\.$/, '')] ?? word.replace(/\.$/, ''))
  .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

export async function saveAgencyOperatingHours(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await requireOrganizationContext(user);
  const agencyId = String(formData.get('agencyId') ?? '').trim();
  if (!agencyId || !(await prisma.agency.findUnique({ where: { id: agencyId }, select: { id: true } }))) {
    return { error: 'This agency is no longer available. Refresh the page and try again.' };
  }

  const schedule = [];
  for (const day of OPERATING_HOURS_DAYS) {
    const hours = String(formData.get(`hours.${day}`) ?? '').trim();
    if (!hours) continue;
    if (hours.length > 120 || !isSupportedOperatingHoursText(hours)) {
      return { error: `Enter ${day} as a time range, “Closed,” or “Open 24 hours.”` };
    }
    schedule.push({ day, hours });
  }

  await prisma.agency.update({ where: { id: agencyId }, data: { businessHours: { schedule, sourceType: 'manual' } } });
  revalidatePath(`/agencies/${agencyId}`);
  revalidatePath('/alerts');
  revalidatePath('/');
  return { success: 'Agency operating hours saved.' };
}

export async function researchAgencyOperatingHours(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  await requireOrganizationContext(user);
  const agencyId = String(formData.get('agencyId') ?? '').trim();
  const agency = agencyId ? await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { id: true, name: true, address: true, city: true, state: true, zip: true },
  }) : null;
  if (!agency) return { error: 'This agency is no longer available. Refresh the page and try again.' };
  if (!agency.address?.trim() || !agency.city?.trim() || !agency.state?.trim()) {
    return { error: 'Add the agency street address, city, and state before researching hours.' };
  }

  let apiKey: string;
  try {
    ({ apiKey } = assertAccountResearchPilotEnabled());
  } catch {
    return { error: 'Public-hours research is unavailable. You can still enter the hours manually.' };
  }

  try {
    const location = [agency.address, agency.city, agency.state, agency.zip].filter(Boolean).join(', ');
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: ACCOUNT_RESEARCH_PILOT_MODEL,
        store: false,
        input: `Find the current publicly listed weekly business hours for this exact Ohio liquor agency location. Search by the supplied account name and full street address. Prefer the Google Maps listing, the agency's official page, or another credible public listing that identifies this exact address. Do not infer hours from another location, chain location, or general business category. Return exactLocation=true only if the source identifies this account name and full address, including city and state, as the same place. Return matchedAddress as the full address shown by the source. Include only days and hours explicitly listed by the source. Use a 12-hour range such as "9:00 AM–5:00 PM", "Closed", or "Open 24 hours". Do not guess missing days. If an exact location or hours source cannot be confirmed, return exactLocation=false and an empty schedule.\n\nAccount name: ${agency.name}\nAddress: ${location}`,
        tools: [{ type: 'web_search', search_context_size: 'low' }],
        max_tool_calls: 1,
        max_output_tokens: 900,
        reasoning: { effort: 'low' },
        text: { verbosity: 'low', format: { type: 'json_schema', name: 'agency_business_hours', strict: true, schema: hoursResearchSchema } },
        include: ['web_search_call.action.sources'],
      }),
    });
    const payload = await response.json() as {
      status?: string;
      error?: { message?: string };
      output?: Array<{ type?: string; action?: { sources?: Array<{ url?: string }> }; content?: Array<{ type?: string; text?: string }> }>;
    };
    if (!response.ok) return { error: 'Public-hours search failed. Try again or enter the hours manually.' };
    const outputText = payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text' && item.text)?.text;
    if (payload.status !== 'completed' || !outputText) return { error: 'No confirmed public hours were found. You can enter known hours manually.' };
    const result = JSON.parse(outputText) as {
      exactLocation?: unknown; matchedName?: unknown; matchedAddress?: unknown; sourceName?: unknown; sourceUrl?: unknown;
      schedule?: Array<{ day?: unknown; hours?: unknown }>;
    };
    const matchedAddress = typeof result.matchedAddress === 'string' ? normalizeIdentity(result.matchedAddress) : '';
    const accountAddress = normalizeIdentity(agency.address);
    const accountName = normalizeIdentity(agency.name);
    const matchedName = typeof result.matchedName === 'string' ? normalizeIdentity(result.matchedName) : '';
    const addressTokens = accountAddress.split(' ');
    const cityMatches = agency.city ? matchedAddress.includes(normalizeIdentity(agency.city)) : false;
    const stateCode = normalizeUsState(agency.state);
    const stateName = US_STATES.find((state) => state.code === stateCode)?.name;
    const matchedAddressTokens = matchedAddress.split(' ');
    const stateMatches = stateCode ? matchedAddressTokens.includes(stateCode.toLowerCase()) || Boolean(stateName && matchedAddress.includes(normalizeIdentity(stateName))) : false;
    const zipInSource = matchedAddress.match(/\b\d{5}\b/)?.[0];
    const zipMatches = !agency.zip || !zipInSource || zipInSource === agency.zip.replace(/\D/g, '').slice(0, 5);
    const addressMatches = addressTokens.length >= 2 && matchedAddress.includes(addressTokens.join(' ')) && cityMatches && stateMatches && zipMatches;
    if (result.exactLocation !== true || !accountName || matchedName !== accountName || !addressMatches) {
      return { error: 'Search could not confirm this exact agency address. Review or enter its hours manually.' };
    }

    const sourceUrl = typeof result.sourceUrl === 'string' ? result.sourceUrl : '';
    const sourceUrls = (payload.output ?? []).filter((item) => item.type === 'web_search_call')
      .flatMap((item) => item.action?.sources ?? []).map((source) => source.url).filter((url): url is string => Boolean(url));
    let parsedSourceUrl: URL;
    try { parsedSourceUrl = new URL(sourceUrl); } catch { return { error: 'Search did not return a valid source link. Enter the hours manually.' }; }
    if (!['http:', 'https:'].includes(parsedSourceUrl.protocol) || !sourceUrls.includes(sourceUrl) || typeof result.sourceName !== 'string' || !result.sourceName.trim()) {
      return { error: 'Search did not return a verifiable source link. Enter the hours manually.' };
    }
    const returnedSchedule = result.schedule ?? [];
    if (!returnedSchedule.length || returnedSchedule.some((entry) => typeof entry.day !== 'string' || !OPERATING_HOURS_DAYS.includes(entry.day as OperatingHoursDay) || typeof entry.hours !== 'string' || !isSupportedOperatingHoursText(entry.hours))) {
      return { error: 'The source did not provide usable weekly hours. You can enter the hours manually.' };
    }
    const schedule = returnedSchedule.map((entry) => ({ day: entry.day as OperatingHoursDay, hours: entry.hours as string }));

    await prisma.agency.update({ where: { id: agency.id }, data: { businessHours: {
      schedule,
      sourceType: 'public-web-research',
      sourceName: result.sourceName.trim().slice(0, 120),
      sourceUrl,
      researchedAt: new Date().toISOString(),
    } } });
    revalidatePath(`/agencies/${agency.id}`);
    revalidatePath('/alerts');
    revalidatePath('/');
    return { success: 'Public hours found for the exact agency address and saved with their source.' };
  } catch {
    return { error: 'Could not verify public hours right now. Try again or enter the hours manually.' };
  }
}
