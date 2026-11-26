// sync-sheet.js : ดึง Google Sheets มาทับไฟล์ Excel ทุก 15 วินาที แล้วเปิดเซิร์ฟเวอร์แดชบอร์ด
const fs = require('fs');
const path = require('path');

const SHEET_ID = '1dA4_XnCNiNUjOyDFlqTUhMiy5RyO0cqa3etcQwlnLeg'; // รหัส Google Sheets
const INTERVAL_SEC = 15;                                          // ดึงข้อมูลทุกกี่วินาที
const TARGET = path.join(__dirname, 'data', '20261119_KPI_2026.xlsx');
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=xlsx';

if (typeof fetch !== 'function') {
  console.log('❌ Node เวอร์ชันเก่าเกินไป กรุณาติดตั้ง Node 18 ขึ้นไปจาก nodejs.org');
  process.exit(1);
}

const now = () => new Date().toLocaleTimeString('th-TH');

async function syncOnce() {
  try {
    const res = await fetch(SHEET_URL, { redirect: 'follow' });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || type.includes('text/html')) {
      throw new Error('Google ไม่ยอมให้ดาวน์โหลด (ตรวจว่าแชร์แบบ "ทุกคนที่มีลิงก์" แล้ว)');
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(TARGET), { recursive: true });
    const tmp = TARGET + '.sync-temp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, TARGET); // เขียนไฟล์ให้เสร็จก่อนแล้วค่อยสลับ กันแดชบอร์ดอ่านไฟล์ครึ่งๆ กลางๆ
    console.log('[' + now() + '] ✅ อัปเดตข้อมูลจาก Google Sheets แล้ว');
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      console.log('[' + now() + '] ❌ ไฟล์ Excel ถูกเปิดค้างอยู่ในโปรแกรม Excel กรุณาปิดไฟล์นั้นก่อน');
    } else {
      console.log('[' + now() + '] ❌ ดึงข้อมูลไม่สำเร็จ: ' + err.message);
    }
  }
}

(async () => {
  console.log('กำลังดึงข้อมูลจาก Google Sheets ครั้งแรก...');
  await syncOnce();
  require('./backend/server.js');             // เปิดเซิร์ฟเวอร์แดชบอร์ดตัวเดิมของคุณ
  setInterval(syncOnce, INTERVAL_SEC * 1000); // ดึงข้อมูลซ้ำทุก 15 วินาที
})();