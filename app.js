// --- CONFIGURATION ---
const SUPABASE_URL = 'https://uorvuwswypswouceexkd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcnZ1d3N3eXBzd291Y2VleGtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MDc5NzQsImV4cCI6MjA4MjM4Mzk3NH0.AbBlJx0B1-vdVHHy79ZKlXl9hNl_AfFnRV5xLzKAwus';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- STATE MANAGEMENT ---
let userSession = null;
let allTrades = [];
let charts = {}; // Store chart instances to destroy them before re-rendering

// --- INITIALIZATION ---
window.addEventListener('load', async () => {
    feather.replace();
    
    // Check Auth State
    const { data: { session } } = await supabase.auth.getSession();
    handleAuthChange(session);

    // Listen for Auth Changes
    supabase.auth.onAuthStateChange((_event, session) => {
        handleAuthChange(session);
    });

    // Set current datetime for trade form
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('trade_datetime').value = now.toISOString().slice(0, 16);
});

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

// --- AUTH ACTIONS ---
document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
});

document.getElementById('signup-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert('Check your email for the confirmation link!');
});

async function handleLogout() {
    await supabase.auth.signOut();
}

// --- NAVIGATION ---
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById('trade-form-section').classList.add('hidden');
    
    // Show target
    document.getElementById(sectionId).classList.remove('hidden');

    // Update Sidebar
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    // Find the nav item that calls this function (rough approximation)
    const navItems = document.querySelectorAll('.nav-item');
    if(sectionId === 'dashboard') navItems[0].classList.add('active');
    if(sectionId === 'logs') navItems[2].classList.add('active');
    if(sectionId === 'review') navItems[3].classList.add('active');
    if(sectionId === 'strategy') navItems[4].classList.add('active');

    // Load Data
    if (sectionId === 'dashboard') loadDashboard();
    if (sectionId === 'logs') loadLogs();
    if (sectionId === 'review') loadReview();
    if (sectionId === 'strategy') loadStrategy();
}

// --- DATA FETCHING ---
async function fetchTrades() {
    const { data, error } = await supabase
        .from('trades')
        .select('*')
        .order('trade_datetime', { ascending: false });
    
    if (error) {
        console.error(error);
        return [];
    }
    allTrades = data;
    return data;
}

// --- DASHBOARD LOGIC ---
async function loadDashboard() {
    const trades = await fetchTrades();
    
    // Calculate Stats
    const totalTrades = trades.length;
    const wins = trades.filter(t => t.trade_outcome === 'Win').length;
    const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0;
    
    const pnl = trades.reduce((acc, t) => acc + (parseFloat(t.profit_loss) || 0), 0);
    
    const followedPlanCount = trades.filter(t => t.followed_plan).length;
    const adherence = totalTrades > 0 ? Math.round((followedPlanCount / totalTrades) * 100) : 0;

    // Update DOM
    document.getElementById('dash-winrate').innerText = `${winRate}%`;
    document.getElementById('dash-pnl').innerText = `$${pnl.toFixed(2)}`;
    document.getElementById('dash-pnl').style.color = pnl >= 0 ? '#10b981' : '#ef4444';
    document.getElementById('dash-adherence').innerText = `${adherence}%`;
    document.getElementById('dash-total').innerText = totalTrades;
    document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    renderPnlChart(trades);
}

function renderPnlChart(trades) {
    // Sort oldest to newest for chart
    const sorted = [...trades].sort((a,b) => new Date(a.trade_datetime) - new Date(b.trade_datetime));
    let cumPnl = 0;
    const dataPoints = sorted.map(t => {
        cumPnl += (parseFloat(t.profit_loss) || 0);
        return cumPnl;
    });
    const labels = sorted.map(t => new Date(t.trade_datetime).toLocaleDateString());

    const ctx = document.getElementById('pnlChart').getContext('2d');
    if (charts.pnl) charts.pnl.destroy();

    charts.pnl = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cumulative P&L ($)',
                data: dataPoints,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: '#334155' } },
                x: { grid: { display: false } }
            }
        }
    });
}

// --- STRATEGY LOGIC ---
async function loadStrategy() {
    const { data } = await supabase.from('user_strategy').select('strategy_content').single();
    if (data) {
        document.getElementById('strategy-editor').value = data.strategy_content;
    }
}

async function saveStrategy() {
    const content = document.getElementById('strategy-editor').value;
    
    // Check if exists
    const { data: existing } = await supabase.from('user_strategy').select('id').single();
    
    let error;
    if (existing) {
        ({ error } = await supabase.from('user_strategy').update({ strategy_content: content }).eq('user_id', userSession.user.id));
    } else {
        ({ error } = await supabase.from('user_strategy').insert({ user_id: userSession.user.id, strategy_content: content }));
    }

    if (error) alert('Error saving strategy');
    else alert('Strategy saved!');
}

// --- NEW TRADE FLOW ---
async function openNewTradeModal() {
    const { data } = await supabase.from('user_strategy').select('strategy_content').single();
    document.getElementById('modal-strategy-text').innerText = data ? data.strategy_content : "No strategy saved yet. Go to Strategy tab to add one.";
    document.getElementById('strategy-modal').classList.remove('hidden');
    document.getElementById('confirm-strategy').checked = false;
    document.getElementById('btn-proceed').disabled = true;
}

function closeStrategyModal() {
    document.getElementById('strategy-modal').classList.add('hidden');
}

function toggleProceedBtn() {
    const checked = document.getElementById('confirm-strategy').checked;
    document.getElementById('btn-proceed').disabled = !checked;
}

function proceedToTradeForm() {
    closeStrategyModal();
    document.getElementById('trade-form').reset();
    document.getElementById('trade-id').value = '';
    document.getElementById('form-title').innerText = 'New Trade Entry';
    calculatePlanAdherence(); // Reset indicator
    
    // Hide all, show form
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById('trade-form-section').classList.remove('hidden');
}

function cancelTradeForm() {
    document.getElementById('trade-form-section').classList.add('hidden');
    showSection('dashboard');
}

// --- PLAN ADHERENCE CALCULATION ---
function calculatePlanAdherence() {
    const liquidity = document.getElementById('liquidity_type').value;
    const htfOb = document.getElementById('check_htf_imbalance_ob').checked;
    const bos = document.getElementById('check_double_bos').checked;
    const poi = document.getElementById('check_ltf_poi_sl').checked;

    const isCompliant = liquidity !== "" && htfOb && bos && poi;
    
    const display = document.getElementById('plan-status-display');
    if (isCompliant) {
        display.innerHTML = '✓ Plan Followed';
        display.className = 'plan-status-pass';
    } else {
        display.innerHTML = '✗ Plan Not Followed';
        display.className = 'plan-status-fail';
    }
    return isCompliant;
}

// --- TRADE SUBMISSION ---
async function handleTradeSubmit(e) {
    e.preventDefault();
    const saveBtn = document.getElementById('save-trade-btn');
    saveBtn.innerText = 'Saving...';
    saveBtn.disabled = true;

    try {
        const followedPlan = calculatePlanAdherence();
        const tradeId = document.getElementById('trade-id').value;
        
        // Handle Image Uploads (Simple sequential upload)
        const uploadFile = async (fileInputId) => {
            const file = document.getElementById(fileInputId).files[0];
            if (!file) return null;
            const fileName = `${userSession.user.id}/${Date.now()}_${file.name}`;
            const { data, error } = await supabase.storage.from('trade-screenshots').upload(fileName, file);
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('trade-screenshots').getPublicUrl(fileName);
            return publicUrl;
        };

        const htfUrl = await uploadFile('file_htf');
        const ltfUrl = await uploadFile('file_ltf');

        const tradeData = {
            user_id: userSession.user.id,
            trade_datetime: document.getElementById('trade_datetime').value,
            session: document.getElementById('session').value,
            symbol: document.getElementById('symbol').value,
            direction: document.getElementById('direction').value,
            entry_price: document.getElementById('entry_price').value || null,
            stop_loss: document.getElementById('stop_loss').value || null,
            risk_amount: document.getElementById('risk_amount').value || null,
            profit_loss: document.getElementById('profit_loss').value || null,
            trade_outcome: document.getElementById('trade_outcome').value,
            liquidity_type: document.getElementById('liquidity_type').value,
            check_htf_imbalance_ob: document.getElementById('check_htf_imbalance_ob').checked,
            check_double_bos: document.getElementById('check_double_bos').checked,
            check_ltf_poi_sl: document.getElementById('check_ltf_poi_sl').checked,
            followed_plan: followedPlan,
            emotional_state: document.getElementById('emotional_state').value,
            notes: document.getElementById('notes').value
        };

        if (htfUrl) tradeData.htf_screenshot_url = htfUrl;
        if (ltfUrl) tradeData.ltf_screenshot_url = ltfUrl;

        let error;
        if (tradeId) {
            ({ error } = await supabase.from('trades').update(tradeData).eq('id', tradeId));
        } else {
            ({ error } = await supabase.from('trades').insert(tradeData));
        }

        if (error) throw error;
        
        alert('Trade saved successfully');
        cancelTradeForm();
        loadDashboard();

    } catch (err) {
        alert('Error: ' + err.message);
        console.error(err);
    } finally {
        saveBtn.innerText = 'Save Trade Log';
        saveBtn.disabled = false;
    }
}

// --- TRADE LOGS ---
async function loadLogs() {
    await fetchTrades();
    renderLogsTable();
}

function renderLogsTable() {
    const tbody = document.getElementById('trade-table-body');
    tbody.innerHTML = '';
    
    const sessionFilter = document.getElementById('filter-session').value;
    const outcomeFilter = document.getElementById('filter-outcome').value;

    const filtered = allTrades.filter(t => {
        const sessionMatch = sessionFilter === 'all' || t.session === sessionFilter;
        const outcomeMatch = outcomeFilter === 'all' || t.trade_outcome === outcomeFilter;
        return sessionMatch && outcomeMatch;
    });

    filtered.forEach(trade => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(trade.trade_datetime).toLocaleDateString()}</td>
            <td><strong>${trade.symbol}</strong> <span style="font-size:0.8em; color:var(--text-muted)">${trade.direction}</span></td>
            <td>${trade.session}</td>
            <td>${trade.liquidity_type || '-'}</td>
            <td class="${trade.trade_outcome === 'Win' ? 'win' : trade.trade_outcome === 'Loss' ? 'loss' : ''}">${trade.trade_outcome}</td>
            <td class="${(trade.profit_loss || 0) >= 0 ? 'win' : 'loss'}">$${parseFloat(trade.profit_loss || 0).toFixed(2)}</td>
            <td>${trade.followed_plan ? '<span class="badge badge-success">Yes</span>' : '<span class="badge badge-danger">No</span>'}</td>
            <td>
                <button onclick="editTrade('${trade.id}')" class="btn-secondary" style="padding:0.25rem 0.5rem">Edit</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function editTrade(id) {
    const trade = allTrades.find(t => t.id === id);
    if (!trade) return;

    // Populate Form
    document.getElementById('trade-id').value = trade.id;
    document.getElementById('trade_datetime').value = new Date(trade.trade_datetime).toISOString().slice(0, 16);
    document.getElementById('session').value = trade.session;
    document.getElementById('symbol').value = trade.symbol;
    document.getElementById('direction').value = trade.direction;
    document.getElementById('entry_price').value = trade.entry_price;
    document.getElementById('stop_loss').value = trade.stop_loss;
    document.getElementById('risk_amount').value = trade.risk_amount;
    document.getElementById('profit_loss').value = trade.profit_loss;
    document.getElementById('trade_outcome').value = trade.trade_outcome;
    
    document.getElementById('liquidity_type').value = trade.liquidity_type;
    document.getElementById('check_htf_imbalance_ob').checked = trade.check_htf_imbalance_ob;
    document.getElementById('check_double_bos').checked = trade.check_double_bos;
    document.getElementById('check_ltf_poi_sl').checked = trade.check_ltf_poi_sl;
    
    document.getElementById('emotional_state').value = trade.emotional_state;
    document.getElementById('notes').value = trade.notes;

    calculatePlanAdherence();
    
    // Show Form
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById('trade-form-section').classList.remove('hidden');
    document.getElementById('form-title').innerText = 'Edit Trade';
}

// --- REVIEW & ANALYTICS ---
async function loadReview() {
    await fetchTrades();
    const trades = allTrades.filter(t => t.trade_outcome === 'Win' || t.trade_outcome === 'Loss'); // Only closed trades

    // 1. Plan Adherence Chart
    const planFollowed = trades.filter(t => t.followed_plan);
    const planBroken = trades.filter(t => !t.followed_plan);
    
    const wrFollowed = planFollowed.length ? (planFollowed.filter(t => t.trade_outcome === 'Win').length / planFollowed.length * 100) : 0;
    const wrBroken = planBroken.length ? (planBroken.filter(t => t.trade_outcome === 'Win').length / planBroken.length * 100) : 0;

    createBarChart('plan adherenceChart', ['Followed Plan', 'Did Not Follow'], [wrFollowed, wrBroken], 'Win Rate %');
    
    document.getElementById('plan-insight').innerText = `You have a ${wrFollowed.toFixed(1)}% Win Rate when following the plan, vs ${wrBroken.toFixed(1)}% when breaking it.`;

    // 2. Session Chart (P&L)
    const sessions = ['Asian', 'London', 'New York'];
    const sessionPnl = sessions.map(s => {
        return trades.filter(t => t.session === s).reduce((sum, t) => sum + (parseFloat(t.profit_loss)||0), 0);
    });
    createBarChart('sessionChart', sessions, sessionPnl, 'Net P&L ($)');

    // 3. Liquidity Type Chart (Win Rate)
    const indTrades = trades.filter(t => t.liquidity_type === 'Inducement');
    const engTrades = trades.filter(t => t.liquidity_type === 'Engineered');
    
    const indWr = indTrades.length ? (indTrades.filter(t => t.trade_outcome === 'Win').length / indTrades.length * 100) : 0;
    const engWr = engTrades.length ? (engTrades.filter(t => t.trade_outcome === 'Win').length / engTrades.length * 100) : 0;
    
    createBarChart('liquidityChart', ['Inducement', 'Engineered'], [indWr, engWr], 'Win Rate %');

    // 4. Emotion Chart
    const emotions = [...new Set(trades.map(t => t.emotional_state))].filter(Boolean);
    const emotionPnl = emotions.map(e => {
        return trades.filter(t => t.emotional_state === e).reduce((sum, t) => sum + (parseFloat(t.profit_loss)||0), 0);
    });
    createBarChart('emotionChart', emotions, emotionPnl, 'Net P&L ($)');
}

function createBarChart(canvasId, labels, data, label) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (charts[canvasId]) charts[canvasId].destroy();

    const colors = data.map(val => val >= 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)');

    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: colors,
                borderColor: colors.map(c => c.replace('0.6', '1')),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, grid: { color: '#334155' } },
                x: { grid: { display: false } }
            }
        }
    });
}