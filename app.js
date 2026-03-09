const API_URL = 'https://script.google.com/macros/s/AKfycbx5u1Qb4rFh4HVaqoGcV6Uy10lTavD7sdXRkJuyhLO0HEsa2FSl-8edS4wq6uLpLHCQ/exec';
const DB_NAME = 'financas_db';
const STORE = 'lançamentos';

let db, chartInstance, lancamentos = [], fotoBase64 = null, editId = null;
let mesAtual = new Date().toISOString().substring(0, 7);
let termoBusca = '';

// Inicializar IndexedDB com versão superior para limpar erros antigos
const request = indexedDB.open(DB_NAME, 10); 
request.onupgradeneeded = e => {
    db = e.target.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
};
request.onsuccess = e => {
    db = e.target.result;
    document.getElementById('filtroMes').value = mesAtual;
    carregarDados();
};

async function carregarDados() {
    const tx = db.transaction(STORE, 'readonly');
    tx.objectStore(STORE).getAll().onsuccess = e => {
        lancamentos = e.target.result;
        atualizarTela();
        if (navigator.onLine) sincronizar();
    };
}

function atualizarTela() {
    const lista = document.getElementById('listaRecentes');
    const filtrados = lancamentos.filter(i => 
        i.data.startsWith(mesAtual) && 
        (i.descricao.toLowerCase().includes(termoBusca) || i.categoria.toLowerCase().includes(termoBusca))
    );

    let rec = 0, desp = 0;
    lista.innerHTML = '';

    filtrados.sort((a, b) => b.data.localeCompare(a.data)).forEach(item => {
        const v = parseFloat(item.valor) || 0;
        item.tipo === 'Receita' ? rec += v : desp += v;

        const imgTag = item.foto ? `<img class="mini-foto" src="${item.foto}" onclick="verFoto('${item.foto}')">` : `<div class="mini-foto" style="background:#eee"></div>`;

        lista.innerHTML += `
            <div class="item">
                ${imgTag}
                <div class="info">
                    <strong>${item.descricao}</strong>
                    <small>${item.categoria} • ${item.data.split('-').reverse().join('/')}</small>
                </div>
                <div style="text-align:right">
                    <div class="${item.tipo === 'Receita' ? 'positivo' : 'negativo'}">R$ ${v.toFixed(2)}</div>
                    <div>
                        <small onclick="excluir('${item.id}')" style="color:#ff4444; cursor:pointer">🗑️</small>
                    </div>
                </div>
            </div>`;
    });

    document.getElementById('saldoTotal').innerText = `R$ ${(rec - desp).toFixed(2)}`;
    document.getElementById('totalRec').innerText = `R$ ${rec.toFixed(2)}`;
    document.getElementById('totalDes').innerText = `R$ ${desp.toFixed(2)}`;
}

// Funções de Interface
document.getElementById('filtroMes').onchange = e => { mesAtual = e.target.value; atualizarTela(); };
document.getElementById('campoBusca').oninput = e => { termoBusca = e.target.value.toLowerCase(); atualizarTela(); };
document.getElementById('tabResumo').onclick = () => navegar('resumo');
document.getElementById('tabGrafico').onclick = () => navegar('grafico');
document.getElementById('tabAdd').onclick = () => abrirForm();
document.getElementById('btnSalvar').onclick = salvar;

function navegar(view) {
    document.getElementById('view-resumo').style.display = view === 'resumo' ? 'block' : 'none';
    document.getElementById('view-grafico').style.display = view === 'grafico' ? 'block' : 'none';
    if (view === 'grafico') renderGrafico();
}

function abrirForm() {
    document.getElementById('modalForm').classList.add('active');
    document.getElementById('overlay').classList.add('active');
}

function fecharTudo() {
    document.querySelectorAll('.modal, .overlay').forEach(el => el.classList.remove('active'));
}

// Foto e Compressão
document.getElementById('inputFoto').addEventListener('change', function(e) {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = event => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const max = 400;
            const scale = max / img.width;
            canvas.width = max; canvas.height = img.height * scale;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            fotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
            alert('Foto carregada!');
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

async function salvar() {
    const item = {
        id: 'ID' + Date.now(),
        tipo: document.getElementById('tipo').value,
        data: document.getElementById('data').value,
        categoria: document.getElementById('categoria').value || 'Geral',
        descricao: document.getElementById('descricao').value || 'S/D',
        valor: parseFloat(document.getElementById('valor').value) || 0,
        foto: fotoBase64,
        sinc: 0
    };

    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(item);
    tx.oncomplete = () => {
        fecharTudo();
        carregarDados();
        fotoBase64 = null;
    };
}

async function excluir(id) {
    if (!confirm('Deseja excluir?')) return;
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => {
        carregarDados();
        fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'delete', id: id }) });
    };
}

async function sincronizar() {
    const unsynced = lancamentos.filter(l => l.sinc === 0);
    for (const item of unsynced) {
        await fetch(API_URL, { 
            method: 'POST', 
            mode: 'no-cors', 
            body: JSON.stringify({ ...item, action: 'create', temFoto: item.foto?'Sim':'Não', fotoBase64: item.foto||'' }) 
        });
        const tx = db.transaction(STORE, 'readwrite');
        item.sinc = 1;
        tx.objectStore(STORE).put(item);
    }
}