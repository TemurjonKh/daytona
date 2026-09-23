import { z } from 'zod';
import type { ViewGeometry } from './views';
const ViewTranscript = z.object({ viewId: z.string(), posterRegionId: z.string(), lines: z.array(z.string()) });
export const TranscriptionSchema = z.object({ views: z.array(ViewTranscript) });
export type Transcription = z.infer<typeof TranscriptionSchema>;
export type DeduplicatedLine = { id: string; originalText: string; normalizedText: string; posterRegionId: string; supportingViewIds: string[]; observationIds: string[]; corroborated: boolean; order: number };
export const normalizeLine = (text: string) => text.normalize('NFKC').replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim();

/** Recover complete view objects only; never repair an incomplete quote. */
export function readTranscription(content: string | null, finishReason: string | null, views: ViewGeometry[]) {
  let parsed: unknown;
  try { parsed = JSON.parse(content ?? ''); } catch { parsed = null; }
  const full = TranscriptionSchema.safeParse(parsed);
  const records: Transcription['views'] = [];
  if (full.success) records.push(...full.data.views);
  else {
    const objects = content?.match(/\{(?:[^{}"]|"(?:\\.|[^"\\])*")*\}/g) ?? [];
    for (const object of objects) {
      try { const record = ViewTranscript.safeParse(JSON.parse(object)); if (record.success) records.push(record.data); } catch { /* incomplete */ }
    }
  }
  if (!full.success && content) {
    // Recover completed strings in an unfinished final view. Do not guess missing JSON characters.
    const tail = content.slice(content.lastIndexOf('{'));
    const viewMatch = tail.match(/"viewId"\s*:\s*("(?:\\.|[^"\\])*")/);
    const regionMatch = tail.match(/"posterRegionId"\s*:\s*("(?:\\.|[^"\\])*")/);
    const linesStart = tail.match(/"lines"\s*:\s*\[/);
    if (viewMatch && regionMatch && linesStart && !tail.trimEnd().endsWith('}')) {
      const strings = tail.slice(linesStart.index! + linesStart[0].length).match(/"(?:\\.|[^"\\])*"(?=\s*[,\]])/g) ?? [];
      try { records.push({ viewId: JSON.parse(viewMatch[1]), posterRegionId: JSON.parse(regionMatch[1]), lines: strings.map(s => JSON.parse(s)) }); } catch { /* no usable strings */ }
    }
  }
  const allowed = new Set(views.map(v => v.viewId));
  const valid = records.filter(r => allowed.has(r.viewId) && r.posterRegionId.trim().length > 0);
  const missingView = views.some(v => !valid.some(r => r.viewId === v.viewId));
  const truncated = finishReason !== 'stop' || !full.success || missingView || valid.length !== records.length;
  return { transcript: { views: valid }, truncated, reasons: truncated ? ['transcription_truncated'] : [] };
}

export function orderedPosterRegionIds(transcript: Transcription, views: ViewGeometry[]): string[] {
  const contextIds = new Set(views.filter(v => v.kind === 'context').map(v => v.viewId));
  const validIds = new Set(views.map(v => v.viewId));
  const records = transcript.views.filter(r => validIds.has(r.viewId));
  // ponytail: Region numbering follows model-reported context reading order, then
  // first tile appearance. There are no measured region coordinates in this schema.
  return [...new Set([...records.filter(r => contextIds.has(r.viewId)), ...records.filter(r => !contextIds.has(r.viewId))].map(r => r.posterRegionId))];
}

/** Context order is authoritative. Insert tile-only observations using same-view
 * anchors, then source rectangle and within-view reading position as a fallback. */
export function deduplicateTranscription(transcript: Transcription, views: ViewGeometry[]): DeduplicatedLine[] {
  const context = views.find(v => v.kind === 'context')!;
  const observations = transcript.views.flatMap((record, recordIndex) => {
    const view = views.find(v => v.viewId === record.viewId);
    if (!view) return [];
    return record.lines.flatMap((text, lineIndex) => {
      const normalized = normalizeLine(text);
      return normalized ? [{ id: `observation-${recordIndex}-${lineIndex}`, text, normalized, region: record.posterRegionId, view, lineIndex, recordIndex,
        position: (view.rect.top + view.rect.height * (lineIndex + 0.5) / Math.max(1, record.lines.length)) / context.rect.height + view.rect.left / context.rect.width * 0.001 }] : [];
    });
  });
  type Observation = (typeof observations)[number];
  const groups: { longest: Observation; members: Observation[] }[] = [];
  for (const observation of [...observations].sort((a, b) => b.normalized.length - a.normalized.length)) {
    const matches = groups.filter(g => g.longest.region === observation.region && g.longest.normalized.includes(observation.normalized));
    if (matches.length) matches.forEach(g => g.members.push(observation));
    else groups.push({ longest: observation, members: [observation] });
  }
  const result: DeduplicatedLine[] = [];
  for (const region of orderedPosterRegionIds(transcript, views)) {
    const subset = groups.filter(g => g.longest.region === region);
    const contextGroups = subset.filter(g => g.members.some(m => m.view.kind === 'context')).sort((a, b) =>
      Math.min(...a.members.filter(m => m.view.kind === 'context').map(m => m.lineIndex)) - Math.min(...b.members.filter(m => m.view.kind === 'context').map(m => m.lineIndex)));
    const anchorOrder = new Map(contextGroups.map((g, i) => [g, i]));
    const ordered = subset.map(group => {
      let order = anchorOrder.get(group);
      if (order === undefined) {
        const observation = group.longest;
        const neighbors = contextGroups.flatMap(g => g.members.filter(m => m.recordIndex === observation.recordIndex).map(m => ({ at: m.lineIndex, order: anchorOrder.get(g)! })));
        const before = neighbors.filter(n => n.at < observation.lineIndex).sort((a, b) => b.at - a.at)[0];
        const after = neighbors.filter(n => n.at > observation.lineIndex).sort((a, b) => a.at - b.at)[0];
        if (before && after && before.order < after.order) order = before.order + (after.order - before.order) * (observation.lineIndex - before.at) / (after.at - before.at);
        else if (before) order = before.order + 0.5 + observation.position * 0.01;
        else if (after) order = after.order - 0.5 + observation.position * 0.01;
        else order = observation.position * Math.max(1, contextGroups.length) - 0.5;
      }
      return { group, order };
    }).sort((a, b) => a.order - b.order);
    for (const { group, order } of ordered) {
      const exact = group.members.filter(m => m.normalized === group.longest.normalized);
      result.push({ id: `line-${result.length + 1}`, originalText: group.longest.text, normalizedText: group.longest.normalized,
        posterRegionId: region, supportingViewIds: [...new Set(group.members.map(m => m.view.viewId))], observationIds: group.members.map(m => m.id),
        corroborated: new Set(exact.map(m => m.view.viewId)).size >= 2 && exact.some(m => m.view.kind === 'tile'), order });
    }
  }
  return result;
}
