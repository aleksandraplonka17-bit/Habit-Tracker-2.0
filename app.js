/* Habit Tracker – vanilla JS, state in localStorage
   - Month grid with habits x days
   - Progress per habit + overall + weekly rings
   - Export/Import JSON
*/
const LS_KEY = "habit-tracker-v2";

const monthSelect = document.getElementById("monthSelect");
const yearInput = document.getElementById("yearInput");
const monthTitle = document.getElementById("monthTitle");
const trackerTable = document.getElementById("trackerTable");
const habitList = document.getElementById("habitList");
const weeksRow = document.getElementById("weeksRow");

const overallPctEl = document.getElementById("overallPct");
const doneCountEl = document.getElementById("doneCount");
const totalCountEl = document.getElementById("totalCount");
const perfectDaysEl = document.getElementById("perfectDays");

const addHabitBtn = document.getElementById("addHabitBtn");
const todayBtn = document.getElementById("todayBtn");
const printBtn = document.getElementById("printBtn");
const exportBtn = document.getElementById("exportBtn");
const importInput = document.getElementById("importInput");
const resetBtn = document.getElementById("resetBtn");

const habitDialog = document.getElementById("habitDialog");
const dialogTitle = document.getElementById("dialogTitle");
const habitNameInput = document.getElementById("habitNameInput");
const habitIconInput = document.getElementById("habitIconInput");
const habitIdInput = document.getElementById("habitIdInput");
const reminderEnabledInput = document.getElementById("reminderEnabledInput");
const weeklyGoalInput = document.getElementById("weeklyGoalInput");
const reminderTimeInput = document.getElementById("reminderTimeInput");


const MONTHS_PL = [
  "Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec",
  "Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"
];

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function defaultState(){
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    year: y,
    month: m,
    habits: [
      { id: uid(), name: "Wstać o 6:00", icon: "⏰" },
      { id: uid(), name: "Siłownia", icon: "🏋️" },
      { id: uid(), name: "10k kroków", icon: "🚶" },
      { id: uid(), name: "Czytanie / nauka", icon: "📚" },
      { id: uid(), name: "Brak alkoholu", icon: "🚫" },
      { id: uid(), name: "Journaling", icon: "📝" },
      { id: uid(), name: "Zimny prysznic", icon: "🚿" }
    ],
    // checks[year-month][habitId][day] = true/false; day is 1..31
    checks: {}
  };
}

let state = loadState();

function ymKey(year, month){ return `${year}-${String(month+1).padStart(2,"0")}`; }

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // minimal migration guard
    if(!parsed.habits || !parsed.checks) return defaultState();
  // reminder fields migration
    parsed.habits.forEach(h=>{
      if(typeof h.reminderEnabled !== "boolean") h.reminderEnabled = false;
      if(typeof h.reminderTime !== "string") h.reminderTime = "20:00";
      if(typeof h.weeklyGoal !== "number" || !isFinite(h.weeklyGoal) || h.weeklyGoal < 1 || h.weeklyGoal > 7) h.weeklyGoal = 4;
    });
    return parsed;
  }catch(e){
    return defaultState();
  }
}
function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function ensureMonthBucket(year, month){
  const key = ymKey(year, month);
  if(!state.checks[key]) state.checks[key] = {};
  for(const h of state.habits){
    if(!state.checks[key][h.id]) state.checks[key][h.id] = {};
  }
}

function daysInMonth(year, month){
  return new Date(year, month+1, 0).getDate();
}

function dayOfWeekMon0(date){
  // JS: 0=Sun..6=Sat -> convert to Mon=0..Sun=6
  const d = date.getDay();
  return (d + 6) % 7;
}

function computeWeeks(year, month){
  // Returns array of week objects: {label, days:[1..], pct}
  // Week boundaries: Monday..Sunday
  const dim = daysInMonth(year, month);
  const days = Array.from({length: dim}, (_,i)=>i+1);

  // map each day to week index based on monday-start calendar
  const weekMap = [];
  for(const day of days){
    const date = new Date(year, month, day);
    // compute ISO-ish week segment inside month:
    // shift to monday-start day index
    weekMap.push({day, dow: dayOfWeekMon0(date)});
  }

  // build weeks by scanning days and splitting on monday boundaries
  const weeks = [];
  let current = [];
  for(let i=0;i<weekMap.length;i++){
    const {day, dow} = weekMap[i];
    if(i===0){
      current.push(day);
    }else{
      // new week when dow==0 (Monday)
      if(dow===0){
        weeks.push(current);
        current = [day];
      }else{
        current.push(day);
      }
    }
  }
  if(current.length) weeks.push(current);

  // Limit display to max 6, like typical month view
  return weeks.map((daysArr, idx)=>({
    label: `Tydz. ${idx+1}`,
    days: daysArr
  }));
}

function pct(n,d){ return d===0 ? 0 : Math.round((n/d)*100); }

function renderMonthControls(){
  monthSelect.innerHTML = "";
  MONTHS_PL.forEach((name, idx)=>{
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = name;
    monthSelect.appendChild(opt);
  });
  monthSelect.value = String(state.month);
  yearInput.value = String(state.year);
}


// --------------------
// Streaks & weekly goals (computed)
// --------------------
function pad2(n){ return String(n).padStart(2,"0"); }
function dateKeyFromParts(y,m,d){ return `${y}-${pad2(m)}-${pad2(d)}`; }
function parseYmKey(ym){
  const parts = String(ym).split("-");
  return {y: parseInt(parts[0],10), m: parseInt(parts[1],10)};
}
function addDays(dateObj, delta){
  const d = new Date(dateObj.getTime());
  d.setDate(d.getDate()+delta);
  return d;
}
function startOfWeekMonday(dateObj){
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}
function buildHabitDateSets(){
  const sets = {};
  if(!state.checks) return sets;
  for(const ym of Object.keys(state.checks)){
    const bucket = state.checks[ym];
    if(!bucket) continue;
    const {y,m} = parseYmKey(ym);
    for(const habitId of Object.keys(bucket)){
      const days = bucket[habitId] || {};
      if(!sets[habitId]) sets[habitId] = new Set();
      for(const dStr of Object.keys(days)){
        if(days[dStr]){
          const d = parseInt(dStr,10);
          if(!isFinite(d)) continue;
          sets[habitId].add(dateKeyFromParts(y,m,d));
        }
      }
    }
  }
  return sets;
}
function computeStreakCurrent(doneSet, refDate){
  let streak = 0;
  let d = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  for(;;){
    const key = dateKeyFromParts(d.getFullYear(), d.getMonth()+1, d.getDate());
    if(!doneSet.has(key)) break;
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}
function computeStreakBest(doneSet){
  if(!doneSet || doneSet.size===0) return 0;
  const dates = Array.from(doneSet).sort();
  let best = 1, cur = 1;
  for(let i=1;i<dates.length;i++){
    const prev = new Date(dates[i-1]);
    const curr = new Date(dates[i]);
    const diffDays = Math.round((curr - prev)/86400000);
    if(diffDays === 1){
      cur++;
      if(cur>best) best=cur;
    } else if(diffDays !== 0){
      cur = 1;
    }
  }
  return best;
}
function computeWeekProgress(doneSet, refDate){
  const start = startOfWeekMonday(refDate);
  let done = 0;
  for(let i=0;i<7;i++){
    const d = addDays(start, i);
    const key = dateKeyFromParts(d.getFullYear(), d.getMonth()+1, d.getDate());
    if(doneSet.has(key)) done++;
  }
  return done;
}

function renderHabitList(habitStats){
  habitList.innerHTML = "";
  const key = ymKey(state.year, state.month);
  ensureMonthBucket(state.year, state.month);

  const dim = daysInMonth(state.year, state.month);

  state.habits.forEach((h, i)=>{
    const wrap = document.createElement("div");
    wrap.className = "habitItem";

    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = h.icon || "✅";

    const name = document.createElement("div");
    name.className = "name";
    name.contentEditable = "true";
    name.spellcheck = false;
    name.textContent = h.name;
    name.addEventListener("blur", ()=>{
      h.name = name.textContent.trim() || h.name;
      saveState();
      renderAll();
    });

    // progress for this habit in current month
    let done = 0;
    for(let d=1; d<=dim; d++){
      if(state.checks[key][h.id][d]) done++;
    }
    const mini = document.createElement("div");
    mini.className = "mini";
    mini.textContent = `${pct(done, dim)}%`;

    const actions = document.createElement("div");
    actions.className = "actions";

    const upBtn = document.createElement("button");
    upBtn.className = "iconBtn";
    upBtn.title = "Przesuń w górę";
    upBtn.textContent = "↑";
    upBtn.disabled = (i===0);
    upBtn.onclick = ()=>{ moveHabit(i, i-1); };

    const downBtn = document.createElement("button");
    downBtn.className = "iconBtn";
    downBtn.title = "Przesuń w dół";
    downBtn.textContent = "↓";
    downBtn.disabled = (i===state.habits.length-1);
    downBtn.onclick = ()=>{ moveHabit(i, i+1); };

    const editBtn = document.createElement("button");
    editBtn.className = "iconBtn";
    editBtn.title = "Edytuj";
    editBtn.textContent = "✎";
    editBtn.onclick = ()=> openHabitDialog(h);

    const delBtn = document.createElement("button");
    delBtn.className = "iconBtn";
    delBtn.title = "Usuń";
    delBtn.textContent = "🗑";
    delBtn.onclick = ()=>{
      if(confirm(`Usunąć nawyk: "${h.name}"?`)){
        deleteHabit(h.id);
      }
    };

    actions.append(upBtn, downBtn, editBtn, delBtn);
    wrap.append(icon, name, mini, actions);
    habitList.appendChild(wrap);
  });
}

function moveHabit(from, to){
  const arr = state.habits;
  const [it] = arr.splice(from, 1);
  arr.splice(to, 0, it);
  saveState();
  renderAll();
}

function openHabitDialog(habit=null){
  if(habit){
    dialogTitle.textContent = "Edytuj nawyk";
    habitNameInput.value = habit.name;
    habitIconInput.value = habit.icon || "";
    habitIdInput.value = habit.id;
    reminderEnabledInput.checked = !!habit.reminderEnabled;
    reminderTimeInput.value = habit.reminderTime || "20:00";
  }else{
    dialogTitle.textContent = "Dodaj nawyk";
    habitNameInput.value = "";
    habitIconInput.value = "";
    habitIdInput.value = "";
    reminderEnabledInput.checked = false;
    reminderTimeInput.value = "20:00";
  }
  habitDialog.showModal();
}

habitDialog.addEventListener("close", ()=>{
  if(habitDialog.returnValue !== "default") return;
  const name = habitNameInput.value.trim();
  const icon = habitIconInput.value.trim() || "✅";
  const id = habitIdInput.value.trim();
  const remEnabled = !!reminderEnabledInput.checked;
  const remTime = (reminderTimeInput.value || "20:00").trim();
  if(!name) return;

  if(id){
    const h = state.habits.find(x=>x.id===id);
    if(h){ h.name = name; h.icon = icon; h.reminderEnabled = remEnabled; h.reminderTime = remTime; }
  }else{
    const newHabit = { id: uid(), name, icon, reminderEnabled: remEnabled, reminderTime: remTime };
    state.habits.push(newHabit);
  }
  ensureMonthBucket(state.year, state.month);
  saveState();
  renderAll();
});

function deleteHabit(habitId){
  state.habits = state.habits.filter(h=>h.id!==habitId);
  // keep checks (for possible restore), but hide from UI
  saveState();
  renderAll();
}

function renderWeeks(){
  weeksRow.innerHTML = "";
  const key = ymKey(state.year, state.month);
  const weeks = computeWeeks(state.year, state.month);
  const dim = daysInMonth(state.year, state.month);

  for(const w of weeks){
    const total = w.days.length * state.habits.length;
    let done = 0;
    for(const d of w.days){
      for(const h of state.habits){
        if(state.checks[key]?.[h.id]?.[d]) done++;
      }
    }
    const p = pct(done, total);

    const card = document.createElement("div");
    card.className = "weekCard";

    const ring = makeRing(p);
    ring.className = "ring";

    const txt = document.createElement("div");
    txt.className = "wkTxt";
    const l = document.createElement("div");
    l.className = "wkLabel";
    l.textContent = w.label;
    const v = document.createElement("div");
    v.className = "wkValue";
    v.textContent = `${p}%`;
    txt.append(l,v);

    card.append(ring, txt);
    weeksRow.appendChild(card);
  }
}

function makeRing(percent){
  const size = 44;
  const stroke = 6;
  const r = (size - stroke)/2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent/100) * c;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));

  const bg = document.createElementNS(svg.namespaceURI, "circle");
  bg.setAttribute("cx", String(size/2));
  bg.setAttribute("cy", String(size/2));
  bg.setAttribute("r", String(r));
  bg.setAttribute("fill", "none");
  bg.setAttribute("stroke", "rgba(255,255,255,.10)");
  bg.setAttribute("stroke-width", String(stroke));

  const fg = document.createElementNS(svg.namespaceURI, "circle");
  fg.setAttribute("cx", String(size/2));
  fg.setAttribute("cy", String(size/2));
  fg.setAttribute("r", String(r));
  fg.setAttribute("fill", "none");
  fg.setAttribute("stroke", "rgba(57,217,138,.95)");
  fg.setAttribute("stroke-width", String(stroke));
  fg.setAttribute("stroke-linecap", "round");
  fg.setAttribute("stroke-dasharray", String(c));
  fg.setAttribute("stroke-dashoffset", String(offset));
  fg.setAttribute("transform", `rotate(-90 ${size/2} ${size/2})`);

  svg.append(bg, fg);
  return svg;
}

function renderTable(habitStats){
  ensureMonthBucket(state.year, state.month);
  const y = state.year;
  const m = state.month;
  const key = ymKey(y, m);
  const dim = daysInMonth(y, m);

  monthTitle.textContent = `${MONTHS_PL[m]} ${y}`;

  // header
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  const th0 = document.createElement("th");
  th0.textContent = "Nawyk";
  hr.appendChild(th0);

  for(let d=1; d<=dim; d++){
    const th = document.createElement("th");
    th.className = "dayHdr";
    th.textContent = String(d);
    // small weekend hint (Mon=0)
    const dow = dayOfWeekMon0(new Date(y,m,d));
    if(dow>=5) th.style.color = "rgba(255,255,255,.75)";
    hr.appendChild(th);
  }
  const thEnd = document.createElement("th");
  thEnd.textContent = "Postęp";
  hr.appendChild(thEnd);
  thead.appendChild(hr);

  const tbody = document.createElement("tbody");

  // rows per habit
  state.habits.forEach((h)=>{
    const tr = document.createElement("tr");
    const tdName = document.createElement("td");
    tdName.textContent = `${h.icon ? h.icon+" " : ""}${h.name}`;
    tr.appendChild(tdName);

    let done = 0;
    for(let d=1; d<=dim; d++){
      const td = document.createElement("td");
      const boxWrap = document.createElement("div");
      boxWrap.className = "chk";
      const cb = document.createElement("checkbox"); // placeholder; will replace with input
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!state.checks[key][h.id][d];
      input.addEventListener("change", ()=>{
        state.checks[key][h.id][d] = input.checked;
        saveState();
        // cheap partial refresh (stats + row progress + week rings)
        renderAll();
      });
      if(input.checked) done++;
      boxWrap.appendChild(input);
      td.appendChild(boxWrap);
      tr.appendChild(td);
    }

    const tdEnd = document.createElement("td");
    tdEnd.className = "rowEnd";
    tdEnd.textContent = `${pct(done, dim)}%`;
    tr.appendChild(tdEnd);

    tbody.appendChild(tr);
  });

  // footer totals by day + overall
  const tfoot = document.createElement("tfoot");
  const fr = document.createElement("tr");
  const ft0 = document.createElement("td");
  ft0.textContent = "Suma dnia";
  fr.appendChild(ft0);

  let totalChecks = 0;
  let doneChecks = 0;
  let perfectDays = 0;

  for(let d=1; d<=dim; d++){
    const td = document.createElement("td");
    let dayDone = 0;
    for(const h of state.habits){
      totalChecks++;
      if(state.checks[key][h.id][d]){
        dayDone++; doneChecks++;
      }
    }
    if(state.habits.length>0 && dayDone === state.habits.length) perfectDays++;
    td.style.textAlign = "center";
    td.textContent = state.habits.length ? `${pct(dayDone, state.habits.length)}%` : "-";
    fr.appendChild(td);
  }
  const ftEnd = document.createElement("td");
  ftEnd.className = "rowEnd";
  const overall = pct(doneChecks, totalChecks);
  ftEnd.textContent = `${overall}%`;
  fr.appendChild(ftEnd);
  tfoot.appendChild(fr);

  trackerTable.innerHTML = "";
  trackerTable.append(thead, tbody, tfoot);

  // KPIs
  overallPctEl.textContent = `${overall}%`;
  doneCountEl.textContent = String(doneChecks);
  totalCountEl.textContent = String(totalChecks);
  perfectDaysEl.textContent = String(perfectDays);
}


// ----------------- Reminders (simple local notifications while app is open) -----------------
let reminderTimers = [];

function clearReminderTimers(){
  reminderTimers.forEach(t => clearTimeout(t));
  reminderTimers = [];
}

function requestNotifPermissionIfNeeded(){
  if(!("Notification" in window)) return Promise.resolve("unsupported");
  if(Notification.permission === "granted" || Notification.permission === "denied"){
    return Promise.resolve(Notification.permission);
  }
  return Notification.requestPermission();
}

function msUntilTime(hhmm){
  const [hh, mm] = (hhmm || "20:00").split(":").map(x=>parseInt(x,10));
  const now = new Date();
  const target = new Date(now);
  target.setHours(isNaN(hh)?20:hh, isNaN(mm)?0:mm, 0, 0);
  if(target <= now){
    // next day
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

function fireReminder(habit){
  const title = "Przypomnienie";
  const body = habit.icon ? `${habit.icon} ${habit.name}` : habit.name;

  if("Notification" in window && Notification.permission === "granted"){
    try{
      new Notification(title, { body, tag: "habit-reminder-"+habit.id });
    }catch(e){
      // fallback
      alert(body);
    }
  }else{
    // fallback in-app
    // (deliberately minimal – you can later replace with toast)
    console.log("REMINDER:", body);
  }
  // reschedule
  scheduleSingleReminder(habit);
}



function scheduleSingleReminder(h){
  if(!h || !h.reminderEnabled) return;
  const key = "habit:"+h.id;
  if(reminderTimers[key]){
    clearTimeout(reminderTimers[key]);
    delete reminderTimers[key];
  }
  const ms = msUntilTime(h.reminderTime || "20:00");
  reminderTimers[key] = setTimeout(()=>fireReminder(h), ms);
}

function scheduleReminders(){
  clearReminderTimers();

  const enabledHabits = (state.habits || []).filter(h => h && h.reminderEnabled);
  if(enabledHabits.length === 0) return;

  // ask permission once per session if any reminders enabled
  requestNotifPermissionIfNeeded().then(()=>{});

  enabledHabits.forEach(h=>{
    const delay = msUntilTime(h.reminderTime || "20:00");
    const t = setTimeout(()=> fireReminder(h), delay);
    reminderTimers.push(t);
  });
}


function renderAll(){
  const habitDateSets = buildHabitDateSets();
  const today = new Date();
  const refDate = (state.year===today.getFullYear() && state.month===today.getMonth()+1)
    ? today
    : new Date(state.year, state.month-1, daysInMonth(state.year, state.month));
  const habitStats = {};
  for(const h of state.habits){
    const set = habitDateSets[h.id] || new Set();
    habitStats[h.id] = {
      currentStreak: computeStreakCurrent(set, refDate),
      bestStreak: computeStreakBest(set),
      weekDone: computeWeekProgress(set, refDate),
      weekGoal: (typeof h.weeklyGoal==="number" ? h.weeklyGoal : 4)
    };
  }
  renderHabitList(habitStats);
  renderWeeks();
  renderTable(habitStats);
  scheduleReminders();
}

function setToToday(){
  const now = new Date();
  state.year = now.getFullYear();
  state.month = now.getMonth();
  saveState();
  renderMonthControls();
  renderAll();
}

// events
monthSelect.addEventListener("change", ()=>{
  state.month = Number(monthSelect.value);
  saveState();
  renderAll();
});
yearInput.addEventListener("change", ()=>{
  state.year = Number(yearInput.value);
  saveState();
  renderAll();
});

addHabitBtn.addEventListener("click", ()=>openHabitDialog());
todayBtn.addEventListener("click", setToToday);
printBtn.addEventListener("click", ()=>window.print());

exportBtn.addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `habit-tracker-${ymKey(state.year,state.month)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

importInput.addEventListener("change", async ()=>{
  const file = importInput.files?.[0];
  if(!file) return;
  try{
    const text = await file.text();
    const parsed = JSON.parse(text);
    // basic validation
    if(!parsed.habits || !parsed.checks) throw new Error("Niepoprawny plik");
    state = parsed;
    saveState();
    renderMonthControls();
    renderAll();
  }catch(e){
    alert("Nie udało się zaimportować pliku JSON.");
  }finally{
    importInput.value = "";
  }
});

resetBtn.addEventListener("click", ()=>{
  if(confirm("Na pewno zresetować dane? (To usunie zapis z przeglądarki)")){
    localStorage.removeItem(LS_KEY);
    state = defaultState();
    saveState();
    renderMonthControls();
    renderAll();
  }
});

// init
renderMonthControls();
renderAll();
