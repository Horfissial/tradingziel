// --- CONFIGURATION ---
const SUPABASE_URL = 'https://uorvuwswypswouceexkd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcnZ1d3N3eXBzd291Y2VleGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MDc5NzQsImV4cCI6MjA4MjM4Mzk3NH0.AbBlJx0B1-vdVHHy79ZKlXl9hNl_AfFnRV5xLzKAwus';

let supabase;
let userSession = null;
let allTrades = [];
let charts = {};

document.addEventListener('DOMContentLoaded', async () => {
    console.log("App starting...");

    // 1. INIT SUPABASE
    if (typeof window.supabase === 'undefined') {
        alert("Supabase script failed to load. Check connection.");
        return;
    }
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase initialized");
    } catch (e) {
        alert("Supabase Init Error. Check URL/Key in app.js");
        return;
    }

    // 2. INIT ICONS
    if (typeof feather !== 'undefined') feather.replace();

    // 3. EVENT LISTENERS (Using IDs directly)
    // Auth
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('signup-btn').addEventListener('click', handleSignup);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // Navigation
    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });
    
    // Nav Links
    document.querySelectorAll('.nav-item[data-target]').forEach(item => {
        item.addEventListener('click', (e) => {
            // Close mobile menu
            if(window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
            showSection(item.dataset.target);
        });
    });

    document.getElementById('nav-new-trade').addEventListener('click', openNewTradeModal);
    
    // Forms
    document.getElementById('save-strategy-btn').addEventListener('click', saveStrategy);
    document.getElementById('trade-form').addEventListener('submit', handleTradeSubmit);
    document.getElementById('cancel-trade-btn').addEventListener('click', () => showSection('dashboard'));
    
    // Modal
    document.getElementById('modal-cancel-btn').addEventListener('click', closeStrategyModal);
    document.getElementById('btn-proceed').addEventListener('click', proceedToTradeForm);
    document.getElementById('confirm-strategy').addEventListener('change', (e) => {
        document.getElementById('btn-proceed').disabled = !e.target.checked;
    });
    
    // Checklist Logic
    ['liquidity_type', 'check_htf_imbalance_ob', 'check_double_bos', 'check_ltf_poi_sl'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', calculatePlanAdherence);
    });

    // 4. CHECK AUTH STATE
    const { data: { session } } = await supabase.auth.getSession();
    handleAuthChange(session);

    supabase.auth.onAuthStateChange((_event, session) => {
        handleAuthChange(session);
    });
});

// --- AUTH ---
function handleAuthChange(session) {
    userSession = session;
    const app = document.getElementById('app-container');
    const auth = document.getElementById('auth-container');
    
    if (session) {
        auth.classList.add('hidden');
        app.classList.remove('hidden');
        document.getElementById('user-email-display').innerText = session.user.email;
        loadDashboard();
    } else {
        auth.classList.remove('hidden');
        app.classList.add('hidden');
    }
}

async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errBox = document.getElementById('auth-error');
    
    if(!email || !password) return alert("Enter email and password");
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        errBox.innerText = "Login Failed: " + error.message;
        errBox.classList.remove('hidden');
    }
}

async function handleSignup() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errBox = document.getElementById('auth-error');
    
    if(!email || !password) return alert("Enter email and password");

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
        errBox.innerText = "Signup Failed: " + error.message;
        errBox.classList.remove('hidden');
    } else {
        alert("Account created! You can now sign in.");
    }
}

async function handleLogout() {
    await supabase.auth.signOut();
}

// --- NAVIGATION ---
function showSection(id) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    // Highlight sidebar
    // (Simplified)
    
    if(id === 'dashboard') loadDashboard();
    if(id === 'logs') loadLogs();
    if(id === 'review') loadReview();
    if(id === 'strategy') loadStrategy();
}

// --- CORE LOGIC ---
async function fetchTrades() {
    if(!userSession) return [];
    const { data, error } = await supabase.from('trades').select('*').order('trade_datetime', {ascending: false});
    if(error) console.error(error);
    allTrades = data || [];
    return allTrades;
}

// --- DASHBOARD ---
async function loadDashboard() {
    const trades = await fetchTrades();
    const wins = trades.filter(t => t.trade_outcome === 'Win').length;
    const total = trades.length;
    
    document.getElementById('dash-winrate').innerText = total ? Math.round((wins/total)*100) + '%' : '0%';
    const pnl = trades.reduce((a, b) => a + (parseFloat(b.profit_loss)||0), 0);
    const pnlEl = document.getElementById('dash-pnl');
    pnlEl.innerText = '$' + pnl.toFixed(2);
    pnlEl.style.color = pnl >= 0 ? '#10b981' : '#ef4444';
    
    document.getElementById('dash-total').innerText = total;
    
    const adherence = total ? Math.round((trades.filter(t=>t.followed_plan).length/total)*100) : 0;
    document.getElementById('dash-adherence').innerText = adherence + '%';

    // Chart
    if(charts.pnl) charts.pnl.destroy();
    const sorted = [...trades].sort((a,b) => new Date(a.trade_datetime) - new Date(b.trade_datetime));
    let cum = 0;
    const data = sorted.map(t => { cum += (parseFloat(t.profit_loss)||0); return cum; });
    
    const ctx = document.getElementById('pnlChart').getContext('2d');
    charts.pnl = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map((_, i) => i+1),
            datasets: [{ label: 'P&L', data, borderColor: '#3b82f6', tension: 0.3 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: {legend:{display:false}} }
    });
}

// --- STRATEGY ---
async function loadStrategy() {
    const { data } = await supabase.from('user_strategy').select('strategy_content').single();
    if(data) document.getElementById('strategy-editor').value = data.strategy_content;
}
async function saveStrategy() {
    const content = document.getElementById('strategy-editor').value;
    const { data: existing } = await supabase.from('user_strategy').select('id').single();
    if(existing) await supabase.from('user_strategy').update({strategy_content: content}).eq('user_id', userSession.user.id);
    else await supabase.from('user_strategy').insert({user_id: userSession.user.id, strategy_content: content});
    alert('Saved');
}

// --- NEW TRADE ---
async function openNewTradeModal() {
    if(window.innerWidth < 768) document.getElementById('sidebar').classList.remove('open');
    const { data } = await supabase.from('user_strategy').select('strategy_content').single();
    document.getElementById('modal-strategy-text').innerText = data ? data.strategy_content : "No strategy saved.";
    document.getElementById('strategy-modal').classList.remove('hidden');
    document.getElementById('confirm-strategy').checked = false;
    document.getElementById('btn-proceed').disabled = true;
}

function closeStrategyModal() { document.getElementById('strategy-modal').classList.add('hidden'); }

function proceedToTradeForm() {
    closeStrategyModal();
    document.getElementById('trade-form').reset();
    document.getElementById('trade-id').value = '';
    // Set Default Date
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('trade_datetime').value = now.toISOString().slice(0, 16);
    
    calculatePlanAdherence();
    showSection('trade-form-section');
}

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
        const payload = {
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
        if(id) await supabase.from('trades').update(payload).eq('id', id);
        else await supabase.from('trades').insert(payload);
        
        alert('Saved!');
        showSection('dashboard');
    } catch(err) {
        alert(err.message);
    } finally {
        btn.disabled = false; btn.innerText = 'Save Trade';
    }
}

// --- LOGS ---
async function loadLogs() {
    await fetchTrades();
    const tbody = document.getElementById('trade-table-body');
    tbody.innerHTML = '';
    allTrades.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(t.trade_datetime).toLocaleDateString()}</td>
            <td>${t.symbol} <small>${t.direction}</small></td>
            <td class="${t.trade_outcome === 'Win' ? 'win' : t.trade_outcome === 'Loss' ? 'loss' : ''}">${t.trade_outcome}</td>
            <td class="${(t.profit_loss||0)>=0?'win':'loss'}">${t.profit_loss}</td>
            <td>${t.followed_plan ? 'Yes' : 'No'}</td>
            <td><button class="btn-secondary" style="padding:5px;" onclick="editTrade('${t.id}')">Edit</button></td>
        `;
        tbody.appendChild(tr);
    });
}

// Expose to window for onclick in HTML
window.editTrade = function(id) {
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
    showSection('trade-form-section');
    document.getElementById('form-title').innerText = 'Edit Trade';
}

// --- REVIEW ---
async function loadReview() {
    // Simplified Charting
    const trades = await fetchTrades();
    // (Add similar logic to dashboard for brevity, structure is already there in HTML)
}