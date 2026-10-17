import { eventTicks, measureTicks, type Clef, type NoteEvent, type Score } from './model.ts';
import { instrumentById } from './instruments.ts';

const TYPE_NAME: Record<NoteEvent['dur'], string> = {
  w: 'whole', h: 'half', q: 'quarter', '8': 'eighth', '16': '16th', '32': '32nd', '64': '64th',
};
const CLEF_SIGN: Record<Clef, [string, number]> = { treble: ['G', 2], bass: ['F', 4], alto: ['C', 3], tenor: ['C', 4] };

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** MusicXML 4.0 (partwise) に変換。MuseScore など他ソフトとの受け渡しに使う。 */
export function scoreToMusicXML(score: Score): string {
  const divisions = 480;
  const mt = measureTicks(score);
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  out.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
  out.push('<score-partwise version="4.0">');
  out.push(`<work><work-title>${esc(score.title)}</work-title></work>`);
  out.push('<identification>');
  if (score.composer) out.push(`<creator type="composer">${esc(score.composer)}</creator>`);
  out.push('<encoding><software>FolioScore</software></encoding></identification>');
  out.push('<part-list>');
  score.parts.forEach((p, i) => {
    const inst = instrumentById(p.instrument);
    out.push(`<score-part id="P${i + 1}"><part-name>${esc(p.name)}</part-name>`);
    out.push(`<score-instrument id="P${i + 1}-I1"><instrument-name>${esc(inst.name)}</instrument-name></score-instrument>`);
    out.push(`<midi-instrument id="P${i + 1}-I1"><midi-channel>${(i % 15) + 1}</midi-channel><midi-program>${inst.program + 1}</midi-program><volume>${p.volume}</volume></midi-instrument>`);
    out.push('</score-part>');
  });
  out.push('</part-list>');

  score.parts.forEach((part, pi) => {
    out.push(`<part id="P${pi + 1}">`);
    const nMeasures = part.staves[0].measures.length;
    const prevTie: boolean[] = part.staves.map(() => false);
    for (let mi = 0; mi < nMeasures; mi++) {
      out.push(`<measure number="${mi + 1}">`);
      if (mi === 0) {
        out.push(`<attributes><divisions>${divisions}</divisions><key><fifths>${score.keySig}</fifths></key>`);
        out.push(`<time><beats>${score.timeSig.num}</beats><beat-type>${score.timeSig.den}</beat-type></time>`);
        if (part.staves.length > 1) out.push(`<staves>${part.staves.length}</staves>`);
        part.staves.forEach((st, si) => {
          const [sign, line] = CLEF_SIGN[st.clef];
          out.push(`<clef${part.staves.length > 1 ? ` number="${si + 1}"` : ''}><sign>${sign}</sign><line>${line}</line></clef>`);
        });
        out.push('</attributes>');
        if (pi === 0) {
          out.push(`<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${score.tempo}</per-minute></metronome></direction-type><sound tempo="${score.tempo}"/></direction>`);
        }
      }
      part.staves.forEach((st, si) => {
        if (si > 0) out.push(`<backup><duration>${mt}</duration></backup>`);
        const voice = si * 4 + 1;
        const m = st.measures[mi];
        const wholeRest = m.events.length === 1 && m.events[0].rest;
        for (const ev of m.events) {
          const dur = eventTicks(ev);
          const staffTag = part.staves.length > 1 ? `<staff>${si + 1}</staff>` : '';
          const dots = '<dot/>'.repeat(ev.dots);
          if (ev.rest) {
            out.push(`<note><rest${wholeRest ? ' measure="yes"' : ''}/><duration>${dur}</duration><voice>${voice}</voice>${wholeRest ? '' : `<type>${TYPE_NAME[ev.dur]}</type>${dots}`}${staffTag}</note>`);
            prevTie[si] = false;
            continue;
          }
          ev.pitches.forEach((p, k) => {
            const ties: string[] = [];
            const tied: string[] = [];
            if (prevTie[si]) { ties.push('<tie type="stop"/>'); tied.push('<tied type="stop"/>'); }
            if (ev.tie) { ties.push('<tie type="start"/>'); tied.push('<tied type="start"/>'); }
            out.push(`<note>${k > 0 ? '<chord/>' : ''}<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ''}<octave>${p.octave}</octave></pitch>`
              + `<duration>${dur}</duration>${ties.join('')}<voice>${voice}</voice><type>${TYPE_NAME[ev.dur]}</type>${dots}${staffTag}`
              + `${tied.length ? `<notations>${tied.join('')}</notations>` : ''}</note>`);
          });
          prevTie[si] = !!ev.tie;
        }
      });
      if (mi === nMeasures - 1) out.push('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
      out.push('</measure>');
    }
    out.push('</part>');
  });
  out.push('</score-partwise>');
  return out.join('\n');
}
