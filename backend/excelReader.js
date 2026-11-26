const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const GROUPS = ['SHOP', 'OP', 'COMMON', 'TEMP'];

function cleanText(value) {
  return value === null || value === undefined ? '' : String(value).replace(/\u00a0/g, ' ').trim();
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = cleanText(value);
  const text = /^\d+,\d{1,2}$/.test(raw) ? raw.replace(',', '.') : raw.replace(/,/g, '');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function normalizeInspector(value) {
  const raw = cleanText(value).replace(/\s+/g, ' ');
  if (!raw || raw === '-' || raw.toLowerCase() === 'n/a') return [];
  const normalized = raw
    .replace(/เก๋๋/g, 'เก๋')
    .replace(/ต้้า/g, 'ต้า')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  const aliases = [
    { name: 'เก๋', pattern: /เก๋/ },
    { name: 'ต้า', pattern: /ต้า|ต\./ },
    { name: 'เอ้', pattern: /เอ้|เอ\./ },
    { name: 'อ้น', pattern: /อ้น/ }
  ];
  return aliases.filter(item => item.pattern.test(normalized)).map(item => item.name);
}

function classifyApproval(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { st: 'approved', apprDate: value.toISOString().slice(0, 10), apprNote: '' };
  }

  const text = cleanText(value);
  if (!text || text === '-') return { st: 'progress', apprDate: null, apprNote: text };

  const lower = text.toLowerCase();
  if (/ร้าน\s*cancel|cancelled|canceled/.test(lower)) {
    return { st: 'cancelled', apprDate: null, apprNote: text };
  }

  // Concept approval or an approval with remaining work is not counted as final approval.
  if (/บางส่วน|concept|รอ|เหลือ|as\s*note|ภายใน/.test(lower)) {
    return { st: 'partial', apprDate: null, apprNote: text };
  }

  if (/^approve(?:d)?(?:\s|#|$)/i.test(text)) {
    return { st: 'approved', apprDate: null, apprNote: text };
  }

  return { st: 'progress', apprDate: null, apprNote: text };
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const row = rows[i] || [];
    const values = row.map(v => cleanText(v).toLowerCase());
    if (values.some(v => v === 'no.' || v === 'no') &&
        values.some(v => v === 'mall') &&
        values.some(v => v === 'brand')) return i;
  }
  return -1;
}

function readExcelData(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`ไม่พบไฟล์ Excel ที่: ${resolvedPath}`);
  }

  const workbook = XLSX.read(fs.readFileSync(resolvedPath), {
    type: 'buffer',
    cellDates: true,
    raw: true
  });

  const records = [];
  const readWarnings = [];

  workbook.SheetNames.forEach(sheetName => {
    const match = sheetName.match(/^(SHOP|OP|COMMON|TEMP)-\s*(M\d+)$/i);
    if (!match) return;

    const grp = match[1].toUpperCase();
    const sheetMall = match[2].toUpperCase();
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true
    });
    const headerIndex = findHeaderRow(rows);

    if (headerIndex < 0) {
      readWarnings.push({
        type: 'HEADER_NOT_FOUND',
        sheet: sheetName,
        message: `ไม่พบหัวตาราง No. / Mall / Brand ในชีต ${sheetName}`
      });
      return;
    }

    // Use the actual No. header position. A few TEMP sheets have an extra
    // blank first column, so fixed zero-based offsets would shift every field.
    const headerRow = rows[headerIndex] || [];
    const noColumn = headerRow.findIndex(value => /^no\.?$/i.test(cleanText(value)));
    const col = offset => noColumn + offset;
    const dataStart = headerIndex + 2; // skip the second header/subheader row
    for (let rowIndex = dataStart; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex] || [];
      const no = toNumber(row[col(0)]);
      const brand = cleanText(row[col(7)]);

      // Only actual numbered records are KPI units; exclude notes and totals.
      if (no === null || !brand || /^total\b|^รวม/i.test(brand)) continue;

      const mallRaw = cleanText(row[col(1)]).toUpperCase();
      const mallMatch = mallRaw.match(/M?\d+/);
      const mall = mallMatch ? (mallMatch[0].startsWith('M') ? mallMatch[0] : `M${mallMatch[0]}`) : sheetMall;
      const category = cleanText(row[col(2)]);
      const type = cleanText(row[col(3)]);
      const floor = cleanText(row[col(4)]);
      const unit = cleanText(row[col(5)]);
      const area = toNumber(row[col(6)]);
      const approvalRaw = row[col(10)];
      const approval = classifyApproval(approvalRaw);
      const who = normalizeInspector(row[col(11)]);

      let rounds = 0;
      // Count only columns explicitly labelled as a numbered round; never count Remark.
      const header = rows[headerIndex] || [];
      for (let roundColumn = col(12); roundColumn < header.length; roundColumn++) {
        if (!/ครั้งที่\s*\d+/i.test(cleanText(header[roundColumn]))) continue;
        const received = row[roundColumn];
        const sent = row[roundColumn + 1];
        if ((received !== null && received !== '') || (sent !== null && sent !== '')) rounds++;
      }

      if (approvalRaw && typeof approvalRaw === 'string' &&
          /^(?:\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\/\d{4,5})$/.test(approvalRaw.trim()) &&
          approval.st !== 'approved') {
        readWarnings.push({
          type: 'INVALID_APPROVAL_DATE',
          sheet: sheetName,
          row: rowIndex + 1,
          brand,
          message: `วันที่ในช่อง แบบ Approved ไม่ถูกต้อง: ${approvalRaw}`
        });
      }

      records.push({
        id: `${sheetName}:${rowIndex + 1}`,
        sheet: sheetName,
        rowId: rowIndex + 1,
        no,
        grp, // Sheet prefix is authoritative; Type may contain "Common 1" on TEMP sheets.
        mall,
        cat: category || 'ไม่ระบุ',
        type: type || '',
        floor,
        unit,
        area,
        brand,
        who,
        st: approval.st,
        appr: approvalRaw instanceof Date
          ? approvalRaw.toLocaleDateString('en-GB')
          : cleanText(approvalRaw),
        apprDate: approval.apprDate,
        apprNote: approval.apprNote,
        rounds
      });
    }
  });

  return { records, readWarnings, sheetNames: workbook.SheetNames };
}

module.exports = { readExcelData, classifyApproval, normalizeInspector };
