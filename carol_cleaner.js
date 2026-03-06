// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = []; let row = [], field = '', inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i+1];
    if (inQuote) {
      if (c==='"' && n==='"') { field+='"'; i++; }
      else if (c==='"') inQuote = false;
      else field += c;
    } else {
      if (c==='"') inQuote = true;
      else if (c===',') { row.push(field); field=''; }
      else if (c==='\n' || (c==='\r' && n==='\n')) {
        row.push(field); field='';
        if (row.some(f=>f!=='')) lines.push(row);
        row=[]; if(c==='\r') i++;
      } else field += c;
    }
  }
  if (field||row.length) { row.push(field); if(row.some(f=>f!=='')) lines.push(row); }
  return lines;
}

// ── Log ───────────────────────────────────────────────────────────────────────
const logEl = document.getElementById('log');
function log(msg, cls='ok') {
  const d=document.createElement('div'); d.className=cls; d.textContent=msg;
  logEl.appendChild(d); logEl.scrollTop=logEl.scrollHeight;
}

// ── State ─────────────────────────────────────────────────────────────────────
let csvData=null, jsonMap=null;
let allData=[], filteredData=[], sortCol=null, sortDir=1, currentPage=1;
const PAGE_SIZE=50;

// ── Badges ────────────────────────────────────────────────────────────────────
function makeBadge(val, type) {
  const s = String(val==null?'':val);
  if (!s || s==='null'||s==='undefined') return '—';
  let cls='badge-other';
  if (type==='status') cls = s.toLowerCase().includes('open')?'badge-open':s.toLowerCase().includes('closed')?'badge-closed':'badge-other';
  else if (type==='priority' && s.toLowerCase()==='urgent') cls='badge-urgent';
  else if (type==='bool') cls = (s==='true'||s==='True')?'badge-true':'badge-false';
  return `<span class="badge ${cls}">${s}</span>`;
}

// ── Clean CSV ─────────────────────────────────────────────────────────────────
function cleanCSV(rawText) {
  document.getElementById('log-section').style.display='block';
  log('▸ Parsing CSV…','step');
  const lines = parseCSV(rawText);
  if (lines.length<2) { log('✗ No data found.','warn'); return null; }

  const headers = lines[0].map(h=>h.trim().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''));
  log(`✔ Loaded ${lines.length-1} rows · ${headers.length} columns`,'ok');

  let rows = lines.slice(1).map(line=>{
    const obj={}; headers.forEach((h,i)=>{obj[h]=(line[i]||'').trim();}); return obj;
  });

  const addrKey        = headers.find(h=>h.includes('addressee'));
  const overallStatKey = headers.find(h=>h==='overall_status'||(h.includes('overall')&&h.includes('status')));
  const overallDateKey = headers.find(h=>h.includes('overall')&&h.includes('date'));

  log('▸ Cleaning addressee_details…','step');
  rows.forEach(r=>{ if(r[addrKey]) r[addrKey]=r[addrKey].replace(/;+\s*$/g,'').replace(/\s+/g,' ').trim(); });

  log('▸ Splitting multi-recipient rows on ";"…','step');
  const expanded=[];
  rows.forEach(r=>{
    const parts=r[addrKey]?r[addrKey].split(';').map(s=>s.trim()).filter(Boolean):[''];
    parts.forEach(part=>expanded.push({...r,[addrKey]:part}));
  });
  log(`✔ Expanded to ${expanded.length} rows`,'ok');
  rows=expanded;

  log('▸ Splitting addressee_details on "|"…','step');
  rows.forEach(r=>{
    const parts=(r[addrKey]||'').split('|').map(s=>s.trim());
    r['recipient']=parts[0]||'';
    r['_status_raw']=parts[1]||'';
    r['recipient_recommendation_date_closed']=parts[2]&&parts[2]!=='NA'?parts[2]:'';
  });

  log('▸ Parsing open/closed & response status…','step');
  rows.forEach(r=>{
    const s=r['_status_raw']||'';
    r['recipient_recommendation_open_closed']=s.toLowerCase().includes('open')?'Open':s.toLowerCase().includes('closed')?'Closed':'';
    r['recipient_recommendation_response_status']=s.replace(/closed/gi,'').replace(/open/gi,'').replace(/-/g,'').replace(/\s+/g,' ').trim();
    delete r['_status_raw'];
  });

  log('▸ Dropping redundant columns…','step');
  const drop=new Set([addrKey,overallStatKey,overallDateKey].filter(Boolean));
  rows.forEach(r=>drop.forEach(k=>delete r[k]));
  log(`✔ Dropped: ${[...drop].join(', ')}`,'info');

  log('▸ Normalising dates to YYYY-MM-DD…','step');
  const dateKeys=Object.keys(rows[0]||{}).filter(k=>k.includes('date'));
  rows.forEach(r=>dateKeys.forEach(k=>{
    if(r[k]){const d=new Date(r[k]);if(!isNaN(d))r[k]=d.toISOString().split('T')[0];}
  }));

  log(`\n✓ CSV clean — ${rows.length} rows ready.`,'ok');
  return rows;
}

// ── Clean JSON ────────────────────────────────────────────────────────────────
function cleanJSON(rawText) {
  log('▸ Parsing JSON…','step');
  let parsed;
  try { parsed=JSON.parse(rawText); } catch(e) { log('✗ Invalid JSON: '+e.message,'warn'); return null; }
  if (!Array.isArray(parsed)) { log('✗ Expected a JSON array.','warn'); return null; }

  const KEEP=['srid','priority','priorityNum','hazmat','mostWanted','keywords','isReiterated','timesReiterated','nprm','greenSheet'];
  const map=new Map();
  parsed.forEach(rec=>{
    const srid=rec.srid||rec.Srid; if(!srid) return;
    const obj={};
    KEEP.forEach(k=>{ if(rec[k]!==undefined&&rec[k]!==null) obj[k]=rec[k]; });
    // snake_case rename to match R conventions
    if(obj.priorityNum!==undefined){obj.priority_number=obj.priorityNum;delete obj.priorityNum;}
    if(obj.mostWanted!==undefined){obj.most_wanted=obj.mostWanted;delete obj.mostWanted;}
    if(obj.isReiterated!==undefined){obj.is_reiterated=obj.isReiterated;delete obj.isReiterated;}
    if(obj.timesReiterated!==undefined){obj.times_reiterated=obj.timesReiterated;delete obj.timesReiterated;}
    if(obj.greenSheet!==undefined){obj.rec_letter_url=obj.greenSheet;delete obj.greenSheet;}
    map.set(srid, obj);
  });
  log(`✔ JSON parsed — ${map.size} unique srids.`,'ok');
  return map;
}

// ── Join ──────────────────────────────────────────────────────────────────────
function joinData(csvRows, jMap) {
  if (!jMap) return csvRows;
  log('▸ Joining CSV + JSON on srid…','step');
  let matched=0;
  const joined=csvRows.map(r=>{
    const e=jMap.get(r['srid']);
    if(e){matched++;return{...r,_json:e};}
    return r;
  });
  log(`✔ ${matched} of ${csvRows.length} rows matched`,'ok');
  return joined;
}

// ── Build / rebuild ───────────────────────────────────────────────────────────
function buildAllData() {
  if (!csvData) return;
  document.getElementById('log-section').style.display='block';
  allData=joinData(csvData,jsonMap);
  filteredData=[...allData];
  updateStats(allData);
  document.getElementById('table-section').style.display='block';
  renderTable();
}

// ── Columns ───────────────────────────────────────────────────────────────────
const PRIORITY_COLS=['srid','mode','recommendationmode','reportno','ntsb_no','ntsbno','mkey','recipient','recommendation','recipient_recommendation_open_closed','recipient_recommendation_response_status','date_issued','dateissued','recipient_recommendation_date_closed','is_multiple_recipient','ismultiplerecipient','abstract','event_date','eventdate','city','state','country','sr_coding_mode','sr_coding_tier_1','sr_coding_tier_2','sr_coding_tier2','sr_url','srurl','accident_report_url','accidentreporturl','rec_letter_url'];
const SKIP_TABLE=new Set(['_json']);
const LINK_COLS=['sr_url','accident_report_url','srurl','accidentreporturl','rec_letter_url'];
const SKIP_MODAL=new Set(['recommendation','srid','recipient',...LINK_COLS]);
const BOOL_KEYS=new Set(['hazmat','most_wanted','is_reiterated','nprm','is_multiple_recipient','ismultiplerecipient']);
const JSON_PRIORITY=['priority','priority_number','nprm','hazmat','most_wanted','is_reiterated','times_reiterated','keywords','rec_letter_url'];

function getDisplayCols(rows) {
  if (!rows.length) return [];
  const all=Object.keys(rows[0]).filter(k=>!SKIP_TABLE.has(k));
  const pri=PRIORITY_COLS.filter(c=>all.includes(c));
  const rest=all.filter(c=>!PRIORITY_COLS.includes(c));
  
  // Add JSON columns if any row has _json data
  let jsonCols=[];
  if (rows.some(r=>r._json)) {
    const jsonKeys=new Set();
    rows.forEach(r=>{ if(r._json) Object.keys(r._json).forEach(k=>{ if(k!=='srid') jsonKeys.add(k); }); });
    const jsonPri=JSON_PRIORITY.filter(c=>jsonKeys.has(c));
    const jsonRest=[...jsonKeys].filter(c=>!JSON_PRIORITY.includes(c));
    jsonCols=[...jsonPri,...jsonRest];
  }
  
  return [...pri,...rest,...jsonCols];
}

// ── Table ─────────────────────────────────────────────────────────────────────
function getColDisplayName(col) {
  const displayNames = {
    'recipient_recommendation_open_closed': 'open or closed',
    'recipient_recommendation_response_status': 'response status',
    'recipient_recommendation_date_closed': 'date closed',
    'is_multiple_recipient': 'multiple recipients',
    'ismultiplerecipient': 'multiple recipients'
  };
  return displayNames[col] || col.replace(/_/g,' ');
}

function renderTable() {
  const cols=getDisplayCols(filteredData);
  const head=document.getElementById('table-head');
  const body=document.getElementById('table-body');

  head.innerHTML='<tr>'+cols.map(c=>{
    const cls=c===sortCol?(sortDir===1?'sorted-asc':'sorted-desc'):'';
    return `<th class="${cls}" data-col="${c}">${getColDisplayName(c)}</th>`;
  }).join('')+'</tr>';

  head.querySelectorAll('th').forEach(th=>{
    th.addEventListener('click',()=>{
      const col=th.dataset.col;
      if(sortCol===col) sortDir*=-1; else{sortCol=col;sortDir=1;}
      
      // Save scroll position
      const tableWrap = document.querySelector('.table-wrap');
      const scrollPos = tableWrap.scrollTop;
      
      filteredData.sort((a,b)=>{
        const aVal=(a[col]!==undefined && a[col]!=='')?a[col]:(a._json?a._json[col]:'');
        const bVal=(b[col]!==undefined && b[col]!=='')?b[col]:(b._json?b._json[col]:'');
        return (aVal||'').toString().localeCompare((bVal||'').toString(),undefined,{numeric:true})*sortDir;
      });
      
      renderTable();
      
      // Restore scroll position
      tableWrap.scrollTop = scrollPos;
    });
  });

  const start=(currentPage-1)*PAGE_SIZE;
  const pageRows=filteredData.slice(start,start+PAGE_SIZE);

  body.innerHTML=pageRows.map((row,i)=>`<tr data-idx="${start+i}">`+cols.map(c=>{
    let val=(row[c]!==undefined && row[c]!=='')?row[c]:(row._json?row._json[c]:'');
    if(c==='recipient_recommendation_open_closed') val=makeBadge(val,'status');
    else if(c==='recipient_recommendation_response_status'&&val) val=makeBadge(val,'other');
    else if(c==='priority'&&val) val=makeBadge(val,'priority');
    else if(BOOL_KEYS.has(c)) val=makeBadge(val,'bool');
    else val=String(val||'').replace(/</g,'&lt;');
    const titleVal=(row[c]!==undefined && row[c]!=='')?row[c]:(row._json?row._json[c]:'');
    return `<td title="${String(titleVal||'').replace(/"/g,'&quot;')}">${val}</td>`;
  }).join('')+'</tr>').join('');

  body.querySelectorAll('tr').forEach(tr=>{
    tr.addEventListener('click',()=>openModal(filteredData[+tr.dataset.idx]));
  });

  const total=filteredData.length, pages=Math.ceil(total/PAGE_SIZE);
  document.getElementById('page-info').textContent=`Showing ${start+1}–${Math.min(start+PAGE_SIZE,total)} of ${total.toLocaleString()} rows`;

  const btns=document.getElementById('page-btns');
  const show=[1];
  if(currentPage>3) show.push('…');
  for(let p=Math.max(2,currentPage-1);p<=Math.min(pages-1,currentPage+1);p++) show.push(p);
  if(currentPage<pages-2) show.push('…');
  if(pages>1) show.push(pages);
  btns.innerHTML=show.map(p=>p==='…'?`<button disabled>…</button>`:`<button class="${p===currentPage?'active':''}" data-p="${p}">${p}</button>`).join('');
  btns.querySelectorAll('button[data-p]').forEach(b=>b.addEventListener('click',()=>{currentPage=+b.dataset.p;renderTable();}));
}

function applyFilters() {
  const q=document.getElementById('search').value.toLowerCase();
  const sf=document.getElementById('status-filter').value;
  filteredData=allData.filter(r=>{
    const matchQ=!q||Object.entries(r).some(([k,v])=>k!=='_json'&&String(v).toLowerCase().includes(q));
    const matchS=!sf||(r['recipient_recommendation_open_closed']||'')===sf;
    return matchQ&&matchS;
  });
  currentPage=1; renderTable();
}

function updateStats(rows) {
  const open=rows.filter(r=>r['recipient_recommendation_open_closed']==='Open').length;
  const closed=rows.filter(r=>r['recipient_recommendation_open_closed']==='Closed').length;
  const uniq=new Set(rows.map(r=>r['srid'])).size;
  document.getElementById('stat-rows').textContent=rows.length.toLocaleString();
  document.getElementById('stat-recs').textContent=uniq.toLocaleString();
  document.getElementById('stat-open').textContent=open.toLocaleString();
  document.getElementById('stat-closed').textContent=closed.toLocaleString();
  document.getElementById('stats-bar').style.display='grid';
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function fieldHtml(k, v) {
  let display;
  const s=String(v==null?'':v);
  if (k==='recipient_recommendation_open_closed') display=makeBadge(s,'status');
  else if (k==='recipient_recommendation_response_status') display=makeBadge(s,'other');
  else if (BOOL_KEYS.has(k)) display=makeBadge(s,'bool');
  else if (k==='priority') display=makeBadge(s,'priority');
  else if (k==='keywords') display=`<span>${s?s.replace(/</g,'&lt;'):'NA'}</span>`;
  else display=`<span>${s?s.replace(/</g,'&lt;'):'—'}</span>`;
  const fullWidth=k==='abstract'?' full-width':'';
  return `<div class="modal-field${fullWidth}"><div class="modal-field-label">${getColDisplayName(k)}</div><div class="modal-field-value">${display}</div></div>`;
}

function openModal(row) {
  if (!row) return;
  document.getElementById('modal-srid').textContent=row['srid']||'';
  document.getElementById('modal-recipient').textContent=row['recipient']||'Recommendation Detail';

  const recText=row['recommendation']||row['abstract']||'';
  const recEl=document.getElementById('modal-rec-text');
  recEl.textContent=recText; recEl.style.display=recText?'block':'none';

  // CSV fields
  const csvKeys=Object.keys(row).filter(k=>!SKIP_MODAL.has(k)&&k!=='_json');
  // Sort fields in user-specified order (including field name variations)
  const fieldOrder=['abstract','mode','recommendationmode','event_date','eventdate','city','state','country','is_multiple_recipient','ismultiplerecipient','recipient_recommendation_open_closed','recipient_recommendation_response_status','date_issued','dateissued','recipient_recommendation_date_closed','reportno','ntsb_no','ntsbno','mkey','sr_coding_mode','sr_coding_tier_1','sr_coding_tier_2','sr_coding_tier2'];
  csvKeys.sort((a,b)=>{
    const aIdx=fieldOrder.indexOf(a);
    const bIdx=fieldOrder.indexOf(b);
    if(aIdx!==-1&&bIdx!==-1) return aIdx-bIdx;
    if(aIdx!==-1) return -1;
    if(bIdx!==-1) return 1;
    return 0;
  });
  document.getElementById('modal-grid-csv').innerHTML=csvKeys.map(k=>fieldHtml(k,row[k])).join('');

  // JSON enrichment
  const enrichEl=document.getElementById('modal-enriched');
  const json=row['_json'];
  if (json) {
    let jKeys=Object.keys(json).filter(k=>k!=='srid'&&!LINK_COLS.includes(k));
    // Always include keywords even if not present
    if(!jKeys.includes('keywords')) jKeys.push('keywords');
    // Sort JSON fields for popup
    const jsonModalOrder=['priority','priority_number','most_wanted','hazmat','is_reiterated','times_reiterated','nprm','keywords','rec_letter_url'];
    jKeys.sort((a,b)=>{
      const aIdx=jsonModalOrder.indexOf(a);
      const bIdx=jsonModalOrder.indexOf(b);
      if(aIdx!==-1&&bIdx!==-1) return aIdx-bIdx;
      if(aIdx!==-1) return -1;
      if(bIdx!==-1) return 1;
      return 0;
    });
    document.getElementById('modal-grid-json').innerHTML=jKeys.map(k=>fieldHtml(k,json[k]!=null?json[k]:'')).join('');
    enrichEl.classList.add('visible');
  } else {
    enrichEl.classList.remove('visible');
  }

  // Links from both CSV and JSON
  const allLinks=[...LINK_COLS.map(k=>({k,v:row[k]})),...(json?LINK_COLS.map(k=>({k,v:json[k]})):[])]
    .filter(({v})=>v);
  const seen=new Set();
  document.getElementById('modal-links').innerHTML=allLinks
    .filter(({v})=>{if(seen.has(v))return false;seen.add(v);return true;})
    .map(({k,v})=>{
      const label=k.includes('accident')?'↗ Investigation Report':k.includes('rec_letter')?'↗ Rec Letter (PDF)':'↗ NTSB Safety Rec';
      return `<a class="modal-link" href="${v}" target="_blank" rel="noopener">${label}</a>`;
    }).join('');

  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow='hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow='';
}
document.getElementById('modal-close').addEventListener('click',closeModal);
document.getElementById('modal-overlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});

// ── File handlers ─────────────────────────────────────────────────────────────
function handleCSV(file) {
  if (!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    const cleaned=cleanCSV(e.target.result);
    if (!cleaned) return;
    csvData=cleaned;
    document.getElementById('drop-zone-csv').classList.add('loaded');
    document.getElementById('csv-tag').textContent='✓ Loaded';
    document.getElementById('csv-loaded-name').textContent='✓ '+file.name;
    buildAllData();
  };
  reader.readAsText(file);
}

function handleJSON(file) {
  if (!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    document.getElementById('log-section').style.display='block';
    const map=cleanJSON(e.target.result);
    if (!map) return;
    jsonMap=map;
    document.getElementById('drop-zone-json').classList.add('loaded');
    document.getElementById('json-tag').textContent='✓ Loaded';
    document.getElementById('json-loaded-name').textContent='✓ '+file.name;
    if (csvData) buildAllData();
    else log('  Waiting for CSV before joining…','info');
  };
  reader.readAsText(file);
}

const dzCSV=document.getElementById('drop-zone-csv');
document.getElementById('file-input-csv').addEventListener('change',e=>handleCSV(e.target.files[0]));
dzCSV.addEventListener('dragover',e=>{e.preventDefault();dzCSV.classList.add('dragover');});
dzCSV.addEventListener('dragleave',()=>dzCSV.classList.remove('dragover'));
dzCSV.addEventListener('drop',e=>{e.preventDefault();dzCSV.classList.remove('dragover');handleCSV(e.dataTransfer.files[0]);});

const dzJSON=document.getElementById('drop-zone-json');
document.getElementById('file-input-json').addEventListener('change',e=>handleJSON(e.target.files[0]));
dzJSON.addEventListener('dragover',e=>{e.preventDefault();dzJSON.classList.add('dragover');});
dzJSON.addEventListener('dragleave',()=>dzJSON.classList.remove('dragover'));
dzJSON.addEventListener('drop',e=>{e.preventDefault();dzJSON.classList.remove('dragover');handleJSON(e.dataTransfer.files[0]);});

document.getElementById('search').addEventListener('input',applyFilters);
document.getElementById('status-filter').addEventListener('change',applyFilters);

document.getElementById('download-btn').addEventListener('click',()=>{
  if (!filteredData.length) return;
  // Get all possible columns from allData to ensure we include all JSON fields
  const cols=getDisplayCols(allData.length ? allData : filteredData);
  const esc=v=>`"${String(v!=null?v:'').replace(/"/g,'""')}"`;
  const csv=[cols.map(esc).join(','),...filteredData.map(r=>cols.map(c=>{
    let val=(r[c]!==undefined && r[c]!=='')?r[c]:(r._json?r._json[c]:'');
    return esc(val);
  }).join(','))].join('\n');
  const now=new Date();
  const ts=`${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=`safety_recs_cleaned_${ts}.csv`;
  a.click();
});
