function processAndValidateData(input) {
  const records = Array.isArray(input) ? input : (input.records || []);
  const errors = Array.isArray(input) ? [] : [...(input.readWarnings || [])];
  const duplicateMap = new Map();

  records.forEach((rec, idx) => {
    if (!rec.brand) {
      errors.push({ id: idx, type: 'NO_BRAND', message: `แถว ${rec.rowId} (${rec.sheet}): ไม่มีชื่อแบรนด์` });
    }
    if (!rec.mall) {
      errors.push({ id: idx, type: 'NO_MALL', message: `แถว ${rec.rowId} (${rec.sheet}): ไม่ระบุสาขา` });
    }
    if (rec.area === null || !Number.isFinite(rec.area)) {
      errors.push({ id: idx, type: 'INVALID_AREA', message: `แบรนด์ ${rec.brand || 'ไม่ระบุ'}: พื้นที่ไม่ถูกต้อง` });
    }

    const unit = String(rec.unit || '').trim();
    if (unit && unit !== '-' && unit.toUpperCase() !== 'N/A') {
      const key = `${String(rec.mall).trim().toUpperCase()}|${unit.toUpperCase()}`;
      if (!duplicateMap.has(key)) duplicateMap.set(key, []);
      duplicateMap.get(key).push(rec);
    }
  });

  const duplicates = [];
  for (const items of duplicateMap.values()) {
    if (items.length < 2) continue;
    duplicates.push({
      mall: items[0].mall,
      unit: items[0].unit,
      brands: [...new Set(items.map(item => item.brand).filter(Boolean))],
      count: items.length,
      sheets: [...new Set(items.map(item => item.sheet))]
    });
  }

  return { records, errors, duplicates };
}

module.exports = { processAndValidateData };
