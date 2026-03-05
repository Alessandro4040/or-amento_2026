const API_URL = 'https://script.google.com/macros/s/AKfycbycxDj4mmekmrcelSJq0vO4um88FGlp1T3OlWzU6bA1lJowiQI1hfZj-hNTmT8GOjEy/exec'; // Substitua pela sua URL se necessário
const DB_NAME = 'financas_db';
const STORE = 'lancamentos';

let db, chartInstance;
let lancamentos = [];
let mesAtual = new Date().toISOString().substring(0, 7);
let busca = '';
let fotoBase64 = null;

// Inicialização
const request = indexedDB.open(DB_NAME, 3);
request.onupgradeneeded = e => {
    db = e.target.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
};
request.onsuccess = e => {
    db = e.target.result;
    document.getElementById('filtroMes').value = mesAtual;
    carregar();
};

async function carregar() {
    const tx = db.transaction(STORE, 'readonly');
    lancamentos = await new Promise(res => {
        tx.objectStore(STORE).getAll().onsuccess = e => res(e.target.result);
    });
    atualizarTela();
    if (navigator.onLine) sincronizar();
}

function atualizarTela() {
    const filtrados = lancamentos.filter(i => 
        i.data.startsWith(mesAtual) && 
        (i.descricao.toLowerCase().includes(busca) || i.categoria.toLowerCase().includes(busca))
    );

    let rec = 0, desp = 0;
    const lista = document.getElementById('listaRecentes');
    lista.innerHTML = '';

    filtrados.sort((a,b) => b.data.localeCompare(a.data)).forEach(item => {
        const v = parseFloat(item.valor);
        item.tipo === 'Receita' ? rec += v : desp += v;

        lista.innerHTML += `
            <div class="item">
                <img class="mini-foto" src="${item.foto || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%23ccc\'%3E%3Cpath d=\'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z\'/%3E%3C/svg%3E'}" onclick="verFoto('${item.foto}')">
                <div class="info">
                    <strong>${item.descricao}</strong>
                    <small>${item.categoria} • ${item.data.split('-').reverse().join('/')}</small>
                </div>
                <div style="text-align:right">
                    <div class="${item.tipo === 'Receita' ? 'positivo' : 'negativo'}" style="font-weight:bold">
                        ${item.tipo === 'Receita' ? '+' : '-'} R$ ${v.toFixed(2)}
                    </div>
                    <small onclick="excluir('${item.id}')" style="color:red; cursor:pointer">Excluir</small>
                </div>
            </div>`;
    });

    document.getElementById('saldoTotal').innerText = `R$ ${(rec - desp).toFixed(2)}`;
    document.getElementById('saldoTotal').className = `valor-principal ${(rec - desp) >= 0 ? 'positivo' : 'negativo'}`;
    document.getElementById('totalRec').innerText = `R$ ${rec.toFixed(2)}`;
    document.getElementById('totalDes').innerText = `R$ ${desp.toFixed(2)}`;
    
    if(document.getElementById('view-grafico').style.display !== 'none') renderGrafico(filtrados);
}

// Funções de Interface
function mudarMes(v) { mesAtual = v; atualizarTela(); }
function buscaDinamica(v) { busca = v.toLowerCase(); atualizarTela(); }

function verFoto(src) {
    if(!src || src.length < 100) return;
    document.getElementById('fotoGrande').src = src;
    document.getElementById('modalZoom').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

function abrirForm() {
    fotoBase64 = null;
    document.getElementById('imgPrev').style.display = 'none';
    document.getElementById('data').value = new Date().toISOString().substring(0, 10);
    document.getElementById('modalForm').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

function fecharTudo() {
    document.querySelectorAll('.modal, .overlay').forEach(el => el.classList.remove('active'));
}

function tratarFoto(input) {
    const reader = new FileReader();
    reader.onload = e => {
        fotoBase64 = e.target.result;
        document.getElementById('imgPrev').src = fotoBase64;
        document.getElementById('imgPrev').style.display = 'block';
    };
    reader.readAsDataURL(input.files[0]);
}

async function salvar() {
    const item = {
        id: 'ID' + Date.now(),
        tipo: document.getElementById('tipo').value,
        data: document.getElementById('data').value,
        categoria: document.getElementById('categoria').value || 'Outros',
        descricao: document.getElementById('descricao').value || 'Sem descrição',
        valor: document.getElementById('valor').value,
        foto: fotoBase64,
        sinc: 0
    };
    if(!item.valor || !item.data) return alert('Preencha valor e data!');
    
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => { fecharTudo(); carregar(); };
}

async function excluir(id) {
    if(!confirm('Deseja excluir?')) return;
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = carregar;
}

function navegar(view) {
    document.getElementById('view-resumo').style.display = view === 'resumo' ? 'block' : 'none';
    document.getElementById('view-grafico').style.display = view === 'grafico' ? 'block' : 'none';
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.currentTarget.classList.add('active');
    if(view === 'grafico') atualizarTela();
}

function renderGrafico(dados) {
    const cats = {};
    dados.filter(i => i.tipo === 'Despesa').forEach(i => {
        cats[i.categoria] = (cats[i.categoria] || 0) + parseFloat(i.valor);
    });

    const ctx = document.getElementById('meuGrafico').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(cats),
            datasets: [{ data: Object.values(cats), backgroundColor: ['#007bff','#22c55e','#ef4444','#f59e0b','#6366f1'] }]
        },
        options: { plugins: { title: { display: true, text: 'Gastos por Categoria' } } }
    });
}

function exportarCSV() {
    const filtrados = lancamentos.filter(i => i.data.startsWith(mesAtual));
    let csv = 'Data;Tipo;Categoria;Descricao;Valor\n';
    filtrados.forEach(i => csv += `${i.data};${i.tipo};${i.categoria};${i.descricao};${i.valor}\n`);
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_${mesAtual}.csv`;
    link.click();
}

async function sincronizar() {
    const tx = db.transaction(STORE, 'readonly');
    const pendentes = await new Promise(res => {
        tx.objectStore(STORE).getAll().onsuccess = e => res(e.target.result.filter(i => i.sinc === 0));
    });

    for(let item of pendentes) {
        try {
            await fetch(API_URL, { method: 'POST', body: JSON.stringify(item) });
            item.sinc = 1;
            db.transaction(STORE, 'readwrite').objectStore(STORE).put(item);
        } catch(e) { console.log('Offline'); break; }
    }
}
