// JavaScript Oficial - Barbearia do Joel
document.addEventListener('DOMContentLoaded', () => {
  initBusinessStatus();
  initDateConstraints();
  initBookingForm();
  initPixModal();
  initFacadeLightbox();
});

// 1. Verificador de Status Aberto / Fechado em Tempo Real
function initBusinessStatus() {
  const badge = document.getElementById('status-badge');
  if (!badge) return;

  const now = new Date();
  const day = now.getDay(); // 0 = Dom, 1 = Seg, 2 = Ter, 3 = Qua, 4 = Qui, 5 = Sex, 6 = Sab
  const hour = now.getHours();
  const minute = now.getMinutes();
  const currentTime = hour + minute / 60;

  let isOpen = false;
  let text = '';

  if (day >= 2 && day <= 5) { // Terça a Sexta: 09h às 19h
    if (currentTime >= 9 && currentTime < 19) {
      isOpen = true;
      text = 'Aberto Agora · Fecha às 19:00';
    } else {
      text = currentTime < 9 ? 'Fechado · Abre hoje às 09:00' : 'Fechado · Abre amanhã às 09:00';
    }
  } else if (day === 6) { // Sábado: 09h às 18h
    if (currentTime >= 9 && currentTime < 18) {
      isOpen = true;
      text = 'Aberto Agora · Fecha às 18:00';
    } else {
      text = currentTime < 9 ? 'Fechado · Abre hoje às 09:00' : 'Fechado · Abre terça às 09:00';
    }
  } else if (day === 0) { // Domingo
    text = 'Fechado Hoje · Abre terça às 09:00';
  } else if (day === 1) { // Segunda
    text = 'Fechado Hoje · Abre amanhã às 09:00';
  }

  badge.className = `status-badge ${isOpen ? 'open' : 'closed'}`;
  badge.innerHTML = `<span class="dot"></span> ${text}`;
}

// 2. Restrições do Calendário
function initDateConstraints() {
  const dateInput = document.getElementById('booking-date');
  if (!dateInput) return;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  dateInput.min = `${yyyy}-${mm}-${dd}`;

  // Ao mudar a data, valida se é Segunda ou Domingo e carrega horários
  dateInput.addEventListener('change', () => {
    const selected = new Date(dateInput.value + 'T12:00:00');
    const day = selected.getDay();

    if (day === 0 || day === 1) {
      showToast('⚠️ A barbearia não abre aos domingos e segundas-feiras. Escolha de terça a sábado.');
      dateInput.value = '';
      resetTimeSlots();
      return;
    }

    loadAvailableTimeSlots(dateInput.value, day);
  });
}

// Gera e carrega horários disponíveis para o dia selecionado
async function loadAvailableTimeSlots(dateStr, dayOfWeek) {
  const timeSelect = document.getElementById('booking-time');
  if (!timeSelect) return;

  timeSelect.innerHTML = '<option value="">Carregando horários...</option>';

  const maxHour = (dayOfWeek === 6) ? 18 : 19; // Sábado fecha às 18h, outros às 19h
  const slots = [];
  
  for (let h = 9; h < maxHour; h++) {
    const hourStr = String(h).padStart(2, '0');
    slots.push(`${hourStr}:00`);
    slots.push(`${hourStr}:30`);
  }

  try {
    const res = await fetch(`/api/agendamentos?data=${encodeURIComponent(dateStr)}`);
    const data = await res.json();
    const ocupados = (data.agendamentos || []).map(a => a.horario);

    timeSelect.innerHTML = '<option value="">Selecione um horário disponível</option>';
    slots.forEach(slot => {
      const isOcupado = ocupados.includes(slot);
      const opt = document.createElement('option');
      opt.value = slot;
      opt.textContent = isOcupado ? `${slot} (Ocupado)` : slot;
      opt.disabled = isOcupado;
      timeSelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Erro ao buscar horários:', err);
    timeSelect.innerHTML = '<option value="">Erro ao carregar horários</option>';
  }
}

function resetTimeSlots() {
  const timeSelect = document.getElementById('booking-time');
  if (timeSelect) {
    timeSelect.innerHTML = '<option value="">Selecione primeiro uma data válida</option>';
  }
}

// 3. Inicialização e Submissão do Formulário de Agendamento
function initBookingForm() {
  const serviceSelect = document.getElementById('booking-service');
  const summaryService = document.getElementById('summary-service');
  const summaryPrice = document.getElementById('summary-price');
  const form = document.getElementById('booking-form');

  if (serviceSelect) {
    serviceSelect.addEventListener('change', () => {
      const selectedOpt = serviceSelect.options[serviceSelect.selectedIndex];
      const price = selectedOpt.getAttribute('data-price') || '30.00';
      const serviceName = selectedOpt.text.split(' - ')[0] || 'Serviço Selecionado';

      if (summaryService) summaryService.textContent = serviceName;
      if (summaryPrice) summaryPrice.textContent = `R$ ${Number(price).toFixed(2)}`;
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nome = document.getElementById('client-name').value.trim();
      const telefone = document.getElementById('client-phone').value.trim();
      const servicoOpt = serviceSelect.options[serviceSelect.selectedIndex];
      const servico = servicoOpt.text.split(' - ')[0];
      const preco = parseFloat(servicoOpt.getAttribute('data-price')) || 30.00;
      const profissional = document.getElementById('booking-barber').value;
      const data = document.getElementById('booking-date').value;
      const horario = document.getElementById('booking-time').value;
      const obs = document.getElementById('booking-notes').value.trim();

      if (!nome || !telefone || !data || !horario || !servicoOpt.value) {
        showToast('⚠️ Por favor preencha todos os campos obrigatórios.');
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processando Agendamento...';

      try {
        const payload = {
          clienteNome: nome,
          clienteTelefone: telefone,
          servico,
          preco,
          profissional,
          data,
          horario,
          observacoes: obs
        };

        const res = await fetch('/api/agendamentos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (!result.success) {
          throw new Error(result.error || 'Falha ao realizar agendamento.');
        }

        showToast('🎉 Agendamento registrado com sucesso!');

        // Abre o modal de confirmação e pagamento PIX opcional
        openConfirmationModal(result.agendamento, result.whatsappUrl);
        form.reset();
        resetTimeSlots();
      } catch (err) {
        alert(err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirmar Agendamento Online';
      }
    });
  }
}

// 4. Modal de Confirmação & PIX
let currentWhatsappUrl = '';

function openConfirmationModal(agendamento, whatsappUrl) {
  currentWhatsappUrl = whatsappUrl;
  const modal = document.getElementById('pix-modal');
  const modalDetails = document.getElementById('modal-booking-details');
  const btnZap = document.getElementById('modal-btn-whatsapp');

  if (modalDetails) {
    modalDetails.innerHTML = `
      <p><strong>Protocolo:</strong> #${agendamento.id}</p>
      <p><strong>Cliente:</strong> ${agendamento.clienteNome}</p>
      <p><strong>Serviço:</strong> ${agendamento.servico}</p>
      <p><strong>Data & Horário:</strong> ${agendamento.data} às ${agendamento.horario}</p>
      <p><strong>Total:</strong> R$ ${Number(agendamento.preco).toFixed(2)}</p>
    `;
  }

  if (btnZap) {
    btnZap.href = whatsappUrl;
  }

  // Gera dados do PIX de Sinal (R$ 15,00)
  generatePixModalData(15.00, agendamento.id);

  if (modal) {
    modal.classList.add('active');
  }
}

async function generatePixModalData(amount, txId) {
  const qrImg = document.getElementById('pix-qr-img');
  const copiaColaInput = document.getElementById('pix-copia-cola');

  try {
    const res = await fetch('/api/pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, txId: `JOEL${txId.replace(/\D/g, '')}` })
    });
    const pixData = await res.json();

    if (pixData.success) {
      if (qrImg) qrImg.src = pixData.qrCodeUrl;
      if (copiaColaInput) copiaColaInput.value = pixData.payloadPix;
    }
  } catch (err) {
    console.error('Erro ao gerar PIX:', err);
  }
}

function initPixModal() {
  const modal = document.getElementById('pix-modal');
  const closeBtn = document.getElementById('modal-close-btn');
  const copyBtn = document.getElementById('btn-copy-pix');

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const input = document.getElementById('pix-copia-cola');
      if (input && input.value) {
        navigator.clipboard.writeText(input.value).then(() => {
          showToast('✅ Código PIX Copia-e-Cola copiado para a área de transferência!');
        });
      }
    });
  }
}

// 5. Toast Notifier
function showToast(msg) {
  let toast = document.getElementById('live-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'live-toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// 6. Lightbox da Fachada Real
function initFacadeLightbox() {
  const trigger = document.getElementById('open-facade-lightbox');
  const modal = document.getElementById('facade-lightbox-modal');
  const closeBtn = document.getElementById('lightbox-close-btn');

  if (trigger && modal) {
    trigger.addEventListener('click', () => {
      modal.classList.add('active');
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  }
}
