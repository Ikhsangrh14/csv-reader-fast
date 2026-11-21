// Fast drop-in replacement for csv-reader 1.0.0 (make.fun csv-reader-speed-01).
// Returns exactly the same {columns, rows, errors} as the reference readCsv for
// every input, but avoids its char-by-char string building: fields are cut out
// with native indexOf scans and slice, whole simple records are split natively,
// and only genuinely broken stretches (stray CRs, CRs inside quotes) fall back
// to a segment-building path. Pure: nothing is kept between run() calls.

const COMMA = 0;
const BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;

  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  // Result of the last field read (avoids a per-field object allocation).
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  // Slow unquoted read: char scan, used only when a field contains a stray CR
  // (a CR not followed by LF). `init` is the value prefix ('' normally, the
  // quoted value for quote junk, '"' for an unterminated quote re-read).
  function readUnquotedSlow(init) {
    let segStart = pos;
    let parts = null;
    let added = 0;
    let i = pos;
    while (i < n) {
      const cc = text.charCodeAt(i);
      if (cc === 44 || cc === 10) {
        if (parts === null) {
          fValue = init + text.slice(segStart, i);
          added = i - segStart;
        } else {
          parts.push(text.slice(segStart, i));
          added += i - segStart;
          fValue = init + parts.join('');
        }
        if (cc === 44) {
          pos = i + 1;
          fEnded = COMMA;
        } else {
          pos = i + 1;
          line++;
          fEnded = BREAK;
        }
        fAdded = added;
        return;
      }
      if (cc === 13) {
        if (text.charCodeAt(i + 1) === 10) {
          if (parts === null) {
            fValue = init + text.slice(segStart, i);
            added = i - segStart;
          } else {
            parts.push(text.slice(segStart, i));
            added += i - segStart;
            fValue = init + parts.join('');
          }
          pos = i + 2;
          line++;
          fEnded = BREAK;
          fAdded = added;
          return;
        }
        if (parts === null) parts = [];
        parts.push(text.slice(segStart, i));
        added += i - segStart;
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        i++;
        segStart = i;
        continue;
      }
      i++;
    }
    if (parts === null) {
      fValue = init + text.slice(segStart, n);
      added = n - segStart;
    } else {
      parts.push(text.slice(segStart, n));
      added += n - segStart;
      fValue = init + parts.join('');
    }
    pos = n;
    fEnded = END;
    fAdded = added;
  }

  // Unquoted field starting at pos. Fast path: locate the field end with
  // native scans, cut it out with one slice, and only check that slice for a
  // CR (the one character that can complicate an unquoted field).
  function readUnquoted(init) {
    if (pos >= n) {
      fValue = init;
      fEnded = END;
      fAdded = 0;
      return;
    }
    const iC = text.indexOf(',', pos);
    const iL = text.indexOf('\n', pos);
    let e;
    let kind;
    if (iC < 0 && iL < 0) {
      e = n;
      kind = END;
    } else if (iL < 0 || (iC >= 0 && iC < iL)) {
      e = iC;
      kind = COMMA;
    } else {
      e = iL;
      kind = BREAK;
    }
    if (e === pos) {
      // Empty field.
      fValue = init;
      fAdded = 0;
      if (kind === COMMA) {
        pos = e + 1;
        fEnded = COMMA;
      } else if (kind === BREAK) {
        pos = e + 1;
        line++;
        fEnded = BREAK;
      } else {
        pos = n;
        fEnded = END;
      }
      return;
    }
    const cand = text.slice(pos, e);
    const iR = cand.indexOf('\r');
    if (iR < 0) {
      fValue = init === '' ? cand : init + cand;
      fAdded = cand.length;
      if (kind === COMMA) {
        pos = e + 1;
        fEnded = COMMA;
      } else if (kind === BREAK) {
        pos = e + 1;
        line++;
        fEnded = BREAK;
      } else {
        pos = n;
        fEnded = END;
      }
      return;
    }
    if (iR === cand.length - 1 && kind === BREAK) {
      // The CR is the first half of the CRLF that ends the field.
      fValue = init === '' ? cand.slice(0, -1) : init + cand.slice(0, -1);
      fAdded = cand.length - 1;
      pos = e + 1;
      line++;
      fEnded = BREAK;
      return;
    }
    readUnquotedSlow(init);
  }

  // Quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let segStart = open + 1;
    let scan = segStart;
    let parts = null;
    let value = '';
    while (true) {
      const iQ = text.indexOf('"', scan);
      if (iQ < 0) {
        // No quote left at all: the opening quote never closes.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        readUnquoted('"');
        return;
      }
      // Segment [segStart, iQ): no quotes inside; may hold LF / CR / CRLF.
      let piece;
      if (iQ === segStart) {
        piece = '';
      } else {
        const seg = text.slice(segStart, iQ);
        const iR = seg.indexOf('\r');
        if (iR < 0) {
          let cnt = 0;
          let li = seg.indexOf('\n');
          while (li >= 0) {
            cnt++;
            li = seg.indexOf('\n', li + 1);
          }
          line += cnt;
          piece = seg;
        } else {
          // CRs (alone or in CRLF) each become one LF and one line. Regex
          // replace/match on the bounded segment keeps this native.
          const breaks = seg.match(/\r\n|\r|\n/g);
          line += breaks === null ? 0 : breaks.length;
          piece = seg.replace(/\r\n|\r/g, '\n');
        }
      }
      if (text.charCodeAt(iQ + 1) === 34) {
        // Doubled quote: one literal quote, field goes on.
        if (parts === null) parts = [];
        parts.push(piece, '"');
        scan = iQ + 2;
        segStart = scan;
        continue;
      }
      // Closing quote.
      if (parts === null) {
        value = piece;
      } else {
        parts.push(piece);
        value = parts.join('');
      }
      pos = iQ + 1;
      break;
    }
    if (pos >= n) {
      fValue = value;
      fEnded = END;
      return;
    }
    const cc = text.charCodeAt(pos);
    if (cc === 44) {
      pos++;
      fValue = value;
      fEnded = COMMA;
      return;
    }
    if (cc === 10) {
      pos++;
      line++;
      fValue = value;
      fEnded = BREAK;
      return;
    }
    if (cc === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line++;
      fValue = value;
      fEnded = BREAK;
      return;
    }
    // Junk after the closing quote, read as unquoted text on top of value.
    readUnquoted(value);
    if (fAdded > 0) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
  }

  function finishRecord(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const cc = text.charCodeAt(pos);
      if (cc === 10) {
        pos++;
        line++;
      } else if (cc === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Whole-record fast path: if the rest of this line has no field starting
    // with a quote and no CR other than a trailing CRLF half, the record is a
    // plain split of the line on commas. (A quote that is not at a field
    // start is a literal character and does not affect this.)
    const iL = text.indexOf('\n', pos);
    const lineEnd = iL < 0 ? n : iL;
    if (lineEnd > pos) {
      let seg = text.slice(pos, lineEnd);
      let fast = true;
      let cr = seg.indexOf('\r');
      if (cr >= 0) {
        if (iL >= 0 && cr === seg.length - 1) {
          seg = seg.slice(0, -1);
        } else {
          fast = false;
        }
      }
      if (fast) {
        let q = seg.indexOf('"');
        while (q >= 0) {
          if (q === 0 || seg.charCodeAt(q - 1) === 44) {
            fast = false;
            break;
          }
          q = seg.indexOf('"', q + 1);
        }
      }
      if (fast) {
        const fields = seg.split(',');
        pos = iL < 0 ? n : iL + 1;
        if (iL >= 0) line++;
        finishRecord(fields);
        continue;
      }
    }

    const fields = [];
    let lastQuoted = false;
    do {
      lastQuoted = text.charCodeAt(pos) === 34;
      if (lastQuoted) readQuoted();
      else readUnquoted('');
      fields.push(fValue);
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    finishRecord(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
