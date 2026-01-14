// Tra Âm -> Dương + Can Chi + Tứ Hóa + Tiết khí gần nhất (bỏ trung khí) + Zodiac
const APP_VERSION = "v10";
// Static site for GitHub Pages (no backend)

const AM_URL = "data/amlich_normalized.csv";
const SOLAR_URL = "data/solar_terms_4zones_2000_2100_with_utc.csv";

// 12 TIẾT (bỏ trung khí) -> Chi mapping (THEO DANH SÁCH CHUẨN)
const TIET_TO_CHI = {
  minor_cold: "Sửu",
  start_of_spring: "Dần",
  awakening_of_insects: "Mão",
  pure_brightness: "Thìn",
  start_of_summer: "Tỵ",
  grain_in_ear: "Ngọ",
  minor_heat: "Mùi",
  start_of_autumn: "Thân",
  white_dew: "Dậu",
  cold_dew: "Tuất",
  start_of_winter: "Hợi",
  major_snow: "Tý",
};
const TIET_KEYS = new Set(Object.keys(TIET_TO_CHI));


// Tứ hóa theo Can (ảnh bạn gửi)
const TU_HOA = {
  "Giáp": { loc: "Liêm", quyen: "Phá",   khoa: "Vũ",    ky: "Dương" },
  "Ất":   { loc: "Cơ",   quyen: "Lương", khoa: "Vi",    ky: "Nguyệt" },
  "Bính": { loc: "Đồng", quyen: "Cơ",    khoa: "Xương", ky: "Liêm" },
  "Đinh": { loc: "Nguyệt", quyen: "Đồng", khoa: "Cơ",  ky: "Cự" },
  "Mậu":  { loc: "Tham", quyen: "Nguyệt", khoa: "Bật",  ky: "Cơ" },
  "Kỷ":   { loc: "Vũ",   quyen: "Tham",   khoa: "Lương",ky: "Khúc" },
  "Canh": { loc: "Nhật", quyen: "Vũ",     khoa: "Âm",   ky: "Đồng" },
  "Tân":  { loc: "Cự",   quyen: "Nhật",   khoa: "Khúc", ky: "Xương" },
  "Nhâm": { loc: "Lương",quyen: "Vi",     khoa: "Phụ",  ky: "Vũ" },
  "Quý":  { loc: "Phá",  quyen: "Cự",     khoa: "Âm",   ky: "Tham" },
};


// ---------- Month Can from Year Can + Month Chi (Tiết) ----------

function yearCanFromYearNumber(y){
  const yy = parseInt(y,10);
  if (!yy) return "";
  // 1984 = Giáp (index 0). => index = (year + 6) % 10
  return CAN_10[(yy + 6) % 10];
}

const CAN_10 = ["Giáp","Ất","Bính","Đinh","Mậu","Kỷ","Canh","Tân","Nhâm","Quý"];
const CHI_12_MONTH_ORDER = ["Dần","Mão","Thìn","Tỵ","Ngọ","Mùi","Thân","Dậu","Tuất","Hợi","Tý","Sửu"];

// Mapping: Year Can group -> Can of month Dần
// Giáp/Kỷ -> Bính; Ất/Canh -> Mậu; Bính/Tân -> Canh; Đinh/Nhâm -> Nhâm; Mậu/Quý -> Giáp
const YEARCAN_TO_DAN_CAN = {
  "Giáp":"Bính", "Kỷ":"Bính",
  "Ất":"Mậu",   "Canh":"Mậu",
  "Bính":"Canh","Tân":"Canh",
  "Đinh":"Nhâm","Nhâm":"Nhâm",
  "Mậu":"Giáp", "Quý":"Giáp",
};

function monthStemFromYearCan(yearCan, monthChi){
  const yc = (yearCan||"").trim();
  const mc = (monthChi||"").trim();
  const danCan = YEARCAN_TO_DAN_CAN[yc];
  if (!danCan) return "";
  const baseIdx = CAN_10.indexOf(danCan);
  const mIdx = CHI_12_MONTH_ORDER.indexOf(mc);
  if (baseIdx < 0 || mIdx < 0) return "";
  return CAN_10[(baseIdx + mIdx) % 10];
}

// ---------- DOM helpers ----------
const el = (id) => document.getElementById(id);
function pad2(n){ return String(n).padStart(2,"0"); }
function normDate(s){ return (s || "").slice(0,10); }

function setStatus(ready, msg){
  const s = el("status");
  if (!s) return;
  s.classList.toggle("ready", !!ready);
  s.innerHTML = `<span class="dot"></span><span>${msg}</span>`;
}

function kv(k, v){
  return `<div class="kv"><div class="k">${k}</div><div class="v">${v}</div></div>`;
}

function tuHoaInline(canLabel){
  const key = (canLabel || "").trim();
  const t = TU_HOA[key];
  if (!t) return "N/A";
  return `Lộc: ${t.loc} • Quyền: ${t.quyen} • Khoa: ${t.khoa} • Kỵ: ${t.ky}`;
}

function formatAmLabel(d,m,y,leap){
  return `${pad2(d)}/${pad2(m)}/${y}${leap ? " (N)" : ""}`;
}

// ---------- data stores ----------
let solarMap = new Map();      // duong YYYY-MM-DD -> row (from âm lịch DB)
let lunarMap = new Map();      // am_key (d-m-y-leap) -> [rows]
let termsByTz = new Map();     // tz -> [terms rows]
let termsUtc = [];             // derived from datetime_utc

function lunarKey(d,m,y,leap){
  return `${d}-${m}-${y}-${leap ? 1 : 0}`;
}

// ---------- CSV load ----------
function parseCSV(url){
  return new Promise((resolve, reject)=>{
    if (typeof Papa === "undefined"){
      reject(new Error("PapaParse chưa load"));
      return;
    }
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res)=> resolve(res.data),
      error: (err)=> reject(err)
    });
  });
}

// ---------- solar term ----------
function getTerms(tz){
  if (tz === "UTC") return termsUtc;
  return termsByTz.get(tz) || [];
}

function findNearestPassedTiet(terms, solarDateStr){
  // compare by date (YYYY-MM-DD)
  const input = new Date(solarDateStr + "T00:00:00");
  let best = null;
  let bestD = null;

  for (const t of terms){
    const k = (t.term_key || "").toString().trim();
    if (!TIET_KEYS.has(k)) continue;
    const dStr = normDate((t.date_local || "").toString().trim());
    if (!dStr) continue;
    const d = new Date(dStr + "T00:00:00");
    if (d <= input && (!bestD || d > bestD)){
      best = t; bestD = d;
    }
  }

  if (!best){
    // fallback: take the last TIẾT in list
    const sorted = terms
      .filter(t => TIET_KEYS.has(((t.term_key||"").toString().trim())) && normDate(((t.date_local||"").toString().trim())))
      .slice()
      .sort((a,b)=> normDate(a.date_local).localeCompare(normDate(b.date_local)));
    best = sorted.length ? sorted[sorted.length - 1] : null;
  }
  return best;
}

// ---------- render ----------
function renderBlockForRow(row, tz){
  const solarDate = row.duong; // YYYY-MM-DD
  const amLabel = formatAmLabel(+row.am_day, +row.am_month, +row.am_year, +row.am_leap === 1);

  const namCC = `${row.nam_can} ${row.nam_chi}`;
  const thangCC = `${row.thang_can} ${row.thang_chi}`;
  const ngayCC = `${row.ngay_can} ${row.ngay_chi}`;

  const tuHoaNam = tuHoaInline(row.nam_can);
  const tuHoaThang = tuHoaInline(row.thang_can);
  const tuHoaNgay = tuHoaInline(row.ngay_can);

  const terms = getTerms(tz);
  const tiet = findNearestPassedTiet(terms, solarDate);

  let tietText = "Không tìm thấy";
  let chiTiet = "N/A";
  let zodiacCanChi = "N/A";
  let canTiet = "";

  if (tiet){
    chiTiet = TIET_TO_CHI[((tiet.term_key||"").toString().trim())] || "N/A";

    // time string
    let timeStr = "";
    if (tz === "UTC" && tiet.datetime_utc){
      timeStr = tiet.datetime_utc.replace("T"," ").slice(0,16);
    } else if (tiet.datetime_local){
      timeStr = tiet.datetime_local.replace("T"," ").slice(0,16);
    } else {
      timeStr = normDate(tiet.date_local);
    }

    // Zodiac (tháng tiết) = CHI của TIẾT (theo mapping 12 TIẾT, bỏ trung khí)
    zodiacCanChi = chiTiet;

    // Can tiết (tháng tiết) tính theo Can năm của KQ và Chi của TIẾT
        // Lập Xuân (Dần) có thể làm 'đổi năm': nếu năm của TIẾT (dương) = năm âm + 1,
    // thì dùng Can của (năm âm + 1) để tính Can tháng tiết.
    let yearCanForTiet = row.nam_can;
    const lunarYearNum = row.am_year || row.am_nam || row.nam_am || row.namam || row.lunar_year;
    // Ưu tiên lấy năm từ chính TIẾT gần nhất (tiet.date_local / datetime_local), tránh lệch do field dương trong amlich CSV
    const tietYearStr = (tiet?.date_local || tiet?.datetime_local || "").toString().trim().slice(0,4);
    if (chiTiet === "Dần"){
      const ly = parseInt(lunarYearNum,10);
      const ty = parseInt(tietYearStr,10);
      if (ly && ty && ty === ly + 1){
        yearCanForTiet = yearCanFromYearNumber(ly + 1);
      }
    }
    canTiet = monthStemFromYearCan(yearCanForTiet, chiTiet);
tietText = `${tiet.term_name} — ${timeStr} <span class="pill">${chiTiet}</span>`;
  }

  return [
    `<div class="sectionTitle">Kết quả</div>`,
    kv("Âm lịch", amLabel),
    kv("Dương lịch", `<span class="pill">${solarDate}</span>`),

    `<div class="sep"></div>`,
    kv("Can Chi năm", namCC),
    kv("Tứ hóa (Can năm)", tuHoaNam),
    kv("Can Chi tháng", thangCC),
    kv("Tứ hóa (Can tháng)", tuHoaThang),
    kv("Can Chi ngày", ngayCC),
    kv("Tứ hóa (Can ngày)", tuHoaNgay),

    `<div class="sep"></div>`,
    kv("Tiết khí gần nhất đã qua", tietText),
    kv("Zodiac (tháng tiết)", zodiacCanChi),
    kv("Can Chi tháng tiết", canTiet ? (`${canTiet} ${chiTiet}`) : "N/A"), 
    kv("Tứ hóa (Can tiết)", canTiet ? tuHoaInline(canTiet) : "N/A"),
  ].join("");
}

function showOutput(html){
  el("out").innerHTML = html;
  el("outCard").style.display = "block";
  el("outCard").scrollIntoView({behavior:"smooth", block:"start"});
}

function handleLunarLookup(){
  const d = parseInt(el("amDay").value, 10);
  const m = parseInt(el("amMonth").value, 10);
  const y = parseInt(el("amYear").value, 10);
  const leap = el("amLeap").checked;
  const tz = el("tz").value;

  if (!(d>=1 && d<=30)) return alert("Ngày âm phải 1..30");
  if (!(m>=1 && m<=12)) return alert("Tháng âm phải 1..12");
  if (!y) return alert("Bạn hãy nhập năm âm");

  const key = lunarKey(d,m,y,leap);
  const rows = lunarMap.get(key) || [];
  const amLabel = formatAmLabel(d,m,y,leap);

  if (!rows.length){
    return showOutput(`<div class="sectionTitle">Kết quả</div>` + kv("Âm lịch", amLabel) + kv("Kết quả", "Không tìm thấy ngày dương tương ứng."));
  }

  if (rows.length === 1){
    return showOutput(renderBlockForRow(rows[0], tz));
  }

  const blocks = rows
    .sort((a,b)=> (a.duong||"").localeCompare(b.duong||""))
    .map((r, idx)=> `<div style="margin-top:${idx===0?0:14}px">${renderBlockForRow(r, tz)}</div>`)
    .join("");
  showOutput(`<div class="sectionTitle">Có ${rows.length} kết quả cho ${amLabel}</div>` + blocks);
}

function handleSolarLookup(){
  const d = el("solarDate").value; // YYYY-MM-DD
  const tz = el("tz2").value;
  if (!d) return alert("Bạn hãy chọn ngày dương");
  const row = solarMap.get(d);
  if (!row){
    return showOutput(`<div class="sectionTitle">Kết quả</div>` + kv("Ngày dương", d) + kv("Kết quả", "Không có trong database."));
  }
  showOutput(renderBlockForRow(row, tz));
}

function handleLookup(){
  const solarPanel = el("panelSolar");
  const isSolarMode = solarPanel && solarPanel.style.display !== "none";
  if (isSolarMode) return handleSolarLookup();
  return handleLunarLookup();
}

// ---------- init ----------
// ===== Theme (Tết / Classic) =====
function applyTheme(theme){
  const b = document.body;
  const isTet = theme === "tet";
  b.classList.toggle("tet", isTet);
  b.classList.toggle("classic", !isTet);
  const t = document.getElementById("themeToggle");
  if (t) t.checked = isTet;
}
function setupThemeToggle(){
  const t = document.getElementById("themeToggle");
  if (!t) return;
  const saved = localStorage.getItem("theme") || "tet";
  applyTheme(saved);
  t.addEventListener("change", () => {
    const theme = t.checked ? "tet" : "classic";
    localStorage.setItem("theme", theme);
    applyTheme(theme);
  });
}
// ===== /Theme =====

async function init(){
  setStatus(false, "Đang tải dữ liệu…");
  setupThemeToggle();

  // Load lunar database
  const amRows = await parseCSV(AM_URL);
  for (const r of amRows){
    const dStr = normDate(r.duong);
    if (!dStr) continue;
    r.duong = dStr;
    solarMap.set(dStr, r);

    const key = lunarKey(parseInt(r.am_day,10), parseInt(r.am_month,10), parseInt(r.am_year,10), parseInt(r.am_leap,10)===1);
    if (!lunarMap.has(key)) lunarMap.set(key, []);
    lunarMap.get(key).push(r);
  }

  // Load solar terms database
  const termRows = await parseCSV(SOLAR_URL);
  for (const t of termRows){
    // normalize fields (defensive against trailing spaces)
    if (t.term_key) t.term_key = String(t.term_key).trim();
    if (t.date_local) t.date_local = String(t.date_local).trim();
    if (t.datetime_local) t.datetime_local = String(t.datetime_local).trim();
    if (t.datetime_utc) t.datetime_utc = String(t.datetime_utc).trim();
    const tz = t.timezone;
    if (tz){
      if (!termsByTz.has(tz)) termsByTz.set(tz, []);
      termsByTz.get(tz).push(t);
    }
    // Build UTC list from datetime_utc
    const utcDate = (t.datetime_utc || "").slice(0,10);
    if (utcDate){
      termsUtc.push({ ...t, timezone: "UTC", date_local: utcDate });
    }
  }

  // sort terms
  for (const [tz, arr] of termsByTz.entries()){
    arr.sort((a,b)=> normDate(a.date_local).localeCompare(normDate(b.date_local)));
  }
  termsUtc = termsUtc
    .filter(t => normDate(t.date_local))
    .sort((a,b)=> normDate(a.date_local).localeCompare(normDate(b.date_local)) || (a.term_key||"").localeCompare(b.term_key||""));

  // de-dupe UTC (same date + term_key)
  const seen = new Set();
  termsUtc = termsUtc.filter(t=>{
    const k = `${normDate(t.date_local)}|${t.term_key||""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  el("btn").disabled = false;
  el("btn").addEventListener("click", handleLookup);

  // Tabs
  const tabL = el("tabLunar");
  const tabS = el("tabSolar");
  const pL = el("panelLunar");
  const pS = el("panelSolar");
  function setMode(mode){
    if (mode === "lunar"){
      tabL.classList.add("active");
      tabS.classList.remove("active");
      pL.style.display = "";
      pS.style.display = "none";
    } else {
      tabS.classList.add("active");
      tabL.classList.remove("active");
      pS.style.display = "";
      pL.style.display = "none";
    }
    el("outCard").style.display = "none";
  }
  tabL.addEventListener("click", ()=> setMode("lunar"));
  tabS.addEventListener("click", ()=> setMode("solar"));
setStatus(true, `Đã sẵn sàng (${APP_VERSION})`);
}

init().catch(err=>{
  console.error(err);
  setStatus(false, "Lỗi tải dữ liệu (check data/ & GitHub Pages)");
  alert("Lỗi tải dữ liệu. Hãy kiểm tra: 1) data/ có đúng 2 file CSV 2) tên file đúng 3) mở bằng GitHub Pages (không file://).");
});
// --- Thêm vào cuối file app.js ---

/**
 * Hiệu ứng pháo hoa nhỏ trong banner chúc mừng
 */
document.addEventListener('DOMContentLoaded', function() {
    const canvas = document.getElementById('fireworks-canvas');
    if (!canvas) return; // Nếu không thấy canvas thì dừng

    const ctx = canvas.getContext('2d');
    const banner = document.getElementById('greeting-banner');
    let w, h;
    let particles = [];

    // Cập nhật kích thước canvas theo kích thước banner
    function resizeCanvas() {
        w = canvas.width = banner.offsetWidth;
        h = canvas.height = banner.offsetHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // Gọi lần đầu

    // Hàm tạo màu ngẫu nhiên (ưu tiên tone vàng/đỏ/cam Tết)
    function randomColor() {
        const colors = ['#FFD700', '#FFEB3B', '#FF5722', '#F44336', '#FFFDE7'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // Lớp đối tượng hạt pháo hoa
    class Particle {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            // Tốc độ và hướng ngẫu nhiên
            this.vx = (Math.random() - 0.5) * 4;
            this.vy = (Math.random() - 0.5) * 4;
            this.alpha = 1; // Độ trong suốt ban đầu
            this.color = randomColor();
            this.radius = Math.random() * 2 + 1; // Kích thước hạt
            this.decay = Math.random() * 0.02 + 0.015; // Tốc độ mờ dần
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.vy += 0.05; // Thêm một chút trọng lực nhẹ
            this.alpha -= this.decay; // Mờ dần theo thời gian
        }

        draw(ctx) {
            ctx.save();
            ctx.globalAlpha = this.alpha;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.restore();
        }
    }

    // Hàm tạo vụ nổ tại vị trí x, y
    function createExplosion(x, y) {
        // Tạo khoảng 15-25 hạt cho mỗi vụ nổ
        const particleCount = Math.floor(Math.random() * 10) + 15;
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle(x, y));
        }
    }

    // Vòng lặp chuyển động chính
    function animate() {
        // Xóa canvas với một lớp mờ nhẹ để tạo hiệu ứng vệt đuôi
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter'; // Chế độ hòa trộn màu cho sáng hơn

        // Cập nhật và vẽ các hạt
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            particles[i].draw(ctx);

            // Xóa hạt khi nó đã mờ hẳn
            if (particles[i].alpha <= 0) {
                particles.splice(i, 1);
            }
        }

        requestAnimationFrame(animate);
    }

    // Tự động tạo các vụ nổ ngẫu nhiên
    function autoExplode() {
        // Chọn vị trí ngẫu nhiên trong vùng banner
        const x = Math.random() * w;
        // Ưu tiên nổ ở nửa trên hoặc giữa để trông đẹp hơn
        const y = Math.random() * h * 0.8 + (h * 0.1); 
        createExplosion(x, y);

        // Hẹn giờ vụ nổ tiếp theo (ngẫu nhiên từ 0.3s đến 1.5s)
        setTimeout(autoExplode, Math.random() * 1200 + 300);
    }

    // Bắt đầu
    animate();
    autoExplode();
    // Tạo ngay một vụ nổ khi mới vào
    createExplosion(w / 2, h / 2);
});
