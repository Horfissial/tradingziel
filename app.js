// --- CONFIGURATION ---
const SUPABASE_URL = 'https://uorvuwswypswouceexkd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcnZ1d3N3eXBzd291Y2VleGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MDc5NzQsImV4cCI6MjA4MjM4Mzk3NH0.AbBlJx0B1-vdVHHy79ZKlXl9hNl_AfFnRV5xLzKAwus';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- INIT ---
let supabase;
let userSession = null;
let allTrades = [];
let charts = {};

window.addEventListener('load', async () => {
    // 1. Initialize Supabase
    if (typeof window.supabase === 'undefined') {
        alert("Supabase SDK failed to load. Check your internet connection.");
        return;
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // 2. Initialize Icons
    if (typeof feather !== 'undefined') feather.replace();

    // 3. Check Session
    try {
        const { data: { session } } = await supabase.auth.getSession();
        handleAuthChange(session);

        supabase.auth.onAuthStateChange((_event, session) => {
            handleAuthChange(session);
        });
    } catch (e) {
        console.error("Auth Init Error:", e);
    }

    // 4. Mobile Menu Logic
    const menuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    if(menuBtn) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }
    // Close sidebar when clicking a link on mobile
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if(window.innerWidth <= 768) sidebar.classList.remove('open');
        });
    });

    // 5. Set Date
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const dateInput = document.getElementById('trade_datetime');
    if(dateInput) dateInput.value = now.toISOString().slice(0, 16);
});

// --- AUTH ---
function handleAuthChange(session) {
    userSession = session;
    if (session) {
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        document.getElementById('user-email-display').innerText = session.user.email;
        loadDashboard();
    } else {
        document.getElementById('auth-container').classList.remove('hidden');
        document.getElementById('app-container').classList.add('hidden');
    }
}

document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorBox = document.getElementById('auth-error');
    
    errorBox.classList.add('hidden');
    if(!email || !password) return alert("Please enter email and password");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        errorBox.innerText = error.message;
        errorBox.classList.remove('hidden');
    }
});

document.getElementById('signup-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorBox = document.getElementById('auth-error');

    errorBox.classList.add('hidden');
    if(!email || !password) return alert("Please enter email and password");

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
        errorBox.innerText = error.message;
        errorBox.classList.remove('hidden');
    } else {
        alert('Account created! You can now log in.');
    }
});

async function handleLogout() {
    await supabase.auth.signOut();
}

// --- NAVIGATION ---
function showSection(sectionId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById('trade-form-section').classList.add('hidden');
    document.getElementById(sectionId).classList.remove('hidden');

    // Update Sidebar Active State
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    // Simple logic to highlight correct tab
    const navs = document.querySelectorAll('.nav-item');
    if(sectionId === 'dashboard') navs[0].classList.add('active');
    if(sectionId === 'logs') navs[2].classList.add('active');
    if(sectionId === 'review') navs[3].classList.add('active');
    if(sectionId === 'strategy') navs[4].classList.add('active');

    if (sectionId === 'dashboard') loadDashboard();
    if (sectionId === 'logs') loadLogs();
    if (sectionId === 'review') loadReview();
    if (sectionId === 'strategy') loadStrategy();
}

// --- DATA FETCHING ---
async function fetchTrades() {
    if(!userSession) return [];
    const { data, error } = await supabase
        .from('trades')
        .select('*')
        .order('trade_datetime', { ascending: false });
    
    if (error) { console.error(error); return []; }
    allTrades = data;
    return data;
}

// --- DASHBOARD ---
async function loadDashboard() {
    const trades = await fetchTrades();
    const wins = trades.filter(t => t.trade_outcome === 'Win').length;
    const total = trades.length;
    const winRate = total > 0 ? Math.round((wins/total)*100) : 0;
    const pnl = trades.reduce((acc, t) => acc + (parseFloat(t.profit_loss)||0), 0);
    const followed = trades.filter(t => t.followed_plan).length;
    const adherence = total > 0 ? Math.round((followed/total)*100) : 0;

    document.getElementById('dash-winrate').innerText = `${winRate}%`;
    document.getElementById('dash-pnl').innerText = `$${pnl.toFixed(2)}`;
    document.getElementById('dash-pnl').style.color = pnl >= 0 ? '#10b981' : '#ef4444';
    document.getElementById('dash-adherence').innerText = `${adherence}%`;
    document.getElementById('dash-total').innerText = total;

    const dateEl = document.getElementById('current-date');
    if(dateEl) dateEl.innerText = new Date().toLocaleDateString();

    renderPnlChart(trades);
}

function renderPnlChart(trades) {
    const sorted = [...trades].sort((a,b) => new Date(a.trade_datetime) - new Date(b.trade_datetime));
    let cum = 0;
    const data = sorted.map(t => { cum += (parseFloat(t.profit_loss)||0); return cum; });
    const labels = sorted.map(t => new Date(t.trade_datetime).toLocaleDateString());

    destroyChart('pnlChart');
    const ctx = document.getElementById('pnlChart').getContext('2d');
    charts.pnlChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cum. P&L',
                data: data,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { grid: { color: '#334155' } }, x: { display: false } },
            plugins: { legend: { display: false } }
        }
    });
}

// --- STRATEGY ---
async function loadStrategy() {
    const { data } = await supabase.from('user_strategy').select('strategy_content').single();
    if(document.getElementById('strategy-editor')) {
        document.getElementById('strategy-editor').value = data ? data.strategy_content : "";
    }
}
async function saveStrategy() {
    const content = document.getElementById('strategy-editor').value;
    const { data: existing } = await supabase.from('user_strategy').select('id').single();
    let error;
    if (existing) ({ error } = await supabase.from('user_strategy').update({ strategy_content: content }).eq('user_id', userSession.user.id));
    else ({ error } = await supabase.from('user_strategy').insert({ user_id: userSession.user.id, strategy_content: content }));
    
    if (error) alert('Error saving strategy');
    else alert('Strategy saved!');
}

// --- TRADE FORM ---
async function openNewTradeModal() {
    const { data } = await supabase.from('user_strategy').select('strategy_content').single();
    document.getElementById('modal-strategy-text').innerText = data ? data.strategy_content : "No strategy saved yet.";
    document.getElementById('strategy-modal').classList.remove('hidden');
    document.getElementById('confirm-strategy').checked = false;
    document.getElementById('btn-proceed').disabled = true;
}
function closeStrategyModal() { document.getElementById('strategy-modal').classList.add('hidden'); }
function toggleProceedBtn() { document.getElementById('btn-proceed').disabled = !document.getElementById('confirm-strategy').checked; }
function proceedToTradeForm() {
    closeStrategyModal();
    document.getElementById('trade-form').reset();
    document.getElementById('trade-id').value = '';
    document.getElementById('form-title').innerText = 'New Trade';
    calculatePlanAdherence();
    showSection('trade-form-section');
    // Hide specific section header if needed or just rely on showSection logic
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById('trade-form-section').classList.remove('hidden');
}
function cancelTradeForm() { showSection('dashboard'); }

function calculatePlanAdherence() {
    const l = document.getElementById('liquidity_type').value;
    const c1 = document.getElementById('check_htf_imbalance_ob').checked;
    const c2 = document.getElementById('check_double_bos').checked;
    const c3 = document.getElementById('check_ltf_poi_sl').checked;
    const pass = l !== "" && c1 && c2 && c3;
    const disp = document.getElementById('plan-status-display');
    disp.innerHTML = pass ? '✓ Plan Followed' : '✗ Plan Not Followed';
    disp.className = pass ? 'plan-status-pass' : 'plan-status-fail';
    return pass;
}

async function handleTradeSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('save-trade-btn');
    btn.disabled = true; btn.innerText = 'Saving...';
    
    try {
        const tradeData = {
            user_id: userSession.user.id,
            trade_datetime: document.getElementById('trade_datetime').value,
            session: document.getElementById('session').value,
            symbol: document.getElementById('symbol').value,
            direction: document.getElementById('direction').value,
            trade_outcome: document.getElementById('trade_outcome').value,
            profit_loss: document.getElementById('profit_loss').value || 0,
            liquidity_type: document.getElementById('liquidity_type').value,
            check_htf_imbalance_ob: document.getElementById('check_htf_imbalance_ob').checked,
            check_double_bos: document.getElementById('check_double_bos').checked,
            check_ltf_poi_sl: document.getElementById('check_ltf_poi_sl').checked,
            followed_plan: calculatePlanAdherence()
        };

        const id = document.getElementById('trade-id').value;
        let error;
        if(id) ({ error } = await supabase.from('trades').update(tradeData).eq('id', id));
        else ({ error } = await supabase.from('trades').insert(tradeData));

        if(error) throw error;
        alert('Trade Saved');
        showSection('dashboard');
    } catch(err) {
        alert(err.message);
    } finally {
        btn.disabled = false; btn.innerText = 'Save Trade';
    }
}

// --- LOGS & CHART UTILS ---
async function loadLogs() {
    await fetchTrades();
    renderLogsTable();
}
function renderLogsTable() {
    const tbody = document.getElementById('trade-table-body');
    tbody.innerHTML = '';
    const sess = document.getElementById('filter-session').value;
    const out = document.getElementById('filter-outcome').value;
    
    const filtered = allTrades.filter(t => {
        return (sess === 'all' || t.session === sess) && (out === 'all' || t.trade_outcome === out);
    });

    filtered.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(t.trade_datetime).toLocaleDateString()}</td>
            <td>${t.symbol}<br><small>${t.direction}</small></td>
            <td>${t.session}</td>
            <td class="${t.trade_outcome === 'Win' ? 'win' : t.trade_outcome === 'Loss' ? 'loss' : ''}">${t.trade_outcome}</td>
            <td class="${(t.profit_loss||0)>=0?'win':'loss'}">$${parseFloat(t.profit_loss||0).toFixed(2)}</td>
            <td>${t.followed_plan ? '<span class="badge-success">Yes</span>' : '<span class="badge-danger">No</span>'}</td>
            <td><button class="btn-secondary" onclick="editTrade('${t.id}')">Edit</button></td>
        `;
        tbody.appendChild(tr);
    });
}
function editTrade(id) {
    const t = allTrades.find(x => x.id === id);
    if(!t) return;
    document.getElementById('trade-id').value = t.id;
    document.getElementById('trade_datetime').value = new Date(t.trade_datetime).toISOString().slice(0, 16);
    document.getElementById('session').value = t.session;
    document.getElementById('symbol').value = t.symbol;
    document.getElementById('direction').value = t.direction;
    document.getElementById('trade_outcome').value = t.trade_outcome;
    document.getElementById('profit_loss').value = t.profit_loss;
    document.getElementById('liquidity_type').value = t.liquidity_type;
    document.getElementById('check_htf_imbalance_ob').checked = t.check_htf_imbalance_ob;
    document.getElementById('check_double_bos').checked = t.check_double_bos;
    document.getElementById('check_ltf_poi_sl').checked = t.check_ltf_poi_sl;
    calculatePlanAdherence();
    
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById('trade-form-section').classList.remove('hidden');
    document.getElementById('form-title').innerText = 'Edit Trade';
}
function destroyChart(id) {
    if(charts[id]) { charts[id].destroy(); charts[id] = null; }
}

// --- REVIEW ---
async function loadReview() {
    await fetchTrades();
    const trades = allTrades.filter(t => t.trade_outcome === 'Win' || t.trade_outcome === 'Loss');
    
    // Plan Chart
    const yes = trades.filter(t => t.followed_plan);
    const no = trades.filter(t => !t.followed_plan);
    const wrYes = yes.length ? (yes.filter(t=>t.trade_outcome==='Win').length/yes.length*100) : 0;
    const wrNo = no.length ? (no.filter(t=>t.trade_outcome==='Win').length/no.length*100) : 0;
    
    document.getElementById('plan-insight').innerText = `Followed Plan WR: ${wrYes.toFixed(0)}% vs Broken Plan WR: ${wrNo.toFixed(0)}%`;
    
    renderBar('plan adherenceChart', ['Followed', 'Broken'], [wrYes, wrNo], 'Win Rate %');

    // Session Chart
    const sessions = ['Asian', 'London', 'New York'];
    const pnl = sessions.map(s => trades.filter(t=>t.session===s).reduce((a,b)=>a+(parseFloat(b.profit_loss)||0),0));
    renderBar('sessionChart', sessions, pnl, 'P&L ($)');
}

function renderBar(id, labels, data, label) {
    destroyChart(id);
    const ctx = document.getElementById(id).getContext('2d');
    const colors = data.map(v => v>=0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)');
    charts[id] = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label, data, backgroundColor: colors }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: '#334155' } }, x: { grid: { display: false } } } }
    });
}