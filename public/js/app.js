// JavaScript Oficial - Barbearia do Joel
document.addEventListener('DOMContentLoaded', () => {
  initBusinessStatus();
  initDateConstraints();
  initBookingForm();
  initPixModal();
  initFacadeLightbox();
  initCancelModal();
});

// Identificador Oficial de Feriados Nacionais e do Rio de Janeiro
function getFeriado(dataStr) {
  if (!dataStr || typeof dataStr !== 'string') return null;
  const [anoStr, mesStr, diaStr] = dataStr.split('-');
  const ano = parseInt(anoStr, 10);
  const mesDia = `${mesStr}-${diaStr}`;

  const fixos = {
    '01-01': 'Ano Novo / Confraternização Universal',
    '01-20': 'São Sebastião (Padroeiro do Rio de Janeiro)',
    '04-21': 'Tiradentes',
    '04-23': 'São Jorge (Feriado RJ)',
    '05-01': 'Dia do Trabalhador',
    '09-07': 'Independência do Brasil',
    '10-12': 'Nossa Senhora Aparecida',
    '11-02': 'Finados',
    '11-15': 'Proclamação da República',
    '11-20': 'Dia da Consciência Negra',
    '12-25': 'Natal'
  };

  if (fixos[mesDia]) return fixos[mesDia];

  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const pascoaMes = Math.floor((h + l - 7 * m + 114) / 31);
  const pascoaDia = ((h + l - 7 * m + 114) % 31) + 1;
  const dataPascoa = new Date(Date.UTC(ano, pascoaMes - 1, pascoaDia));

  const addDias = (dias) => {
    const res = new Date(dataPascoa.getTime() + (dias * 24 * 60 * 60 * 1000));
    const mm = String(res.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(res.getUTCDate()).padStart(2, '0');
    return `${mm}-${dd}`;
  };

  if (mesDia === addDias(-47) || mesDia === addDias(-48)) return 'Carnaval';
  if (mesDia === addDias(-46)) return 'Quarta-feira de Cinzas';
  if (mesDia === addDias(-2)) return 'Sexta-feira Santa';
  if (mesDia === addDias(60)) return 'Corpus Christi';

  return null;
}

// 1. Verificador de Status Aberto / Fechado em Tempo Real (Fechado aos Sábados, Domingos, Segundas e Feriados)
function initBusinessStatus() {
  const badge = document.getElementById('status-badge');
  if (!badge) return;

  const now = new Date();
  const day = now.getDay(); // 0 = Dom, 1 = Seg, 2 = Ter, 3 = Qua, 4 = Qui, 5 = Sex, 6 = Sab
  const hour = now.getHours();
  const minute = now.getMinutes();
  const currentTime = hour + minute / 60;

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const feriadoHoje = getFeriado(todayStr);

  let isOpen = false;
  let text = '';

  if (feriadoHoje) {
    text = `Fechado Hoje · Feriado (${feriadoHoje})`;
  } else if (day === 6) { // Sábado
    text = 'Fechado Hoje (Sábado) · Abre terça às 09:00';
  } else if (day === 0) { // Domingo
    text = 'Fechado Hoje (Domingo) · Abre terça às 09:00';
  } else if (day === 1) { // Segunda
    text = 'Fechado Hoje (Segunda) · Abre amanhã às 09:00';
  } else if (day >= 2 && day <= 5) { // Terça a Sexta: 09h às 19h
    if (currentTime >= 9 && currentTime < 19) {
      isOpen = true;
      text = 'Aberto Agora · Fecha às 19:00';
    } else if (currentTime < 9) {
      text = 'Fechado · Abre hoje às 09:00';
    } else {
      text = day === 5 ? 'Fechado · Abre terça às 09:00' : 'Fechado · Abre amanhã às 09:00';
    }
  }

  badge.className = `status-badge ${isOpen ? 'open' : 'closed'}`;
  badge.innerHTML = `<span class="dot"></span> ${text}`;
}

// 2. Restrições do Calendário e Datas
function initDateConstraints() {
  const dateInput = document.getElementById('booking-date');
  if (!dateInput) return;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  dateInput.min = `${yyyy}-${mm}-${dd}`;

  dateInput.addEventListener('change', () => {
    if (!dateInput.value) {
      resetTimeSlots();
      return;
    }
    const [ano, mes, dia] = dateInput.value.split('-').map(Number);
    const selected = new Date(ano, mes - 1, dia, 12, 0, 0);
    const day = selected.getDay();

    if (day === 6) {
      showToast('⚠️ A barbearia fecha aos sábados. Atendimento de terça a sexta-feira.');
      dateInput.value = '';
      resetTimeSlots();
      return;
    }
    if (day === 0) {
      showToast('⚠️ A barbearia fecha aos domingos. Atendimento de terça a sexta-feira.');
      dateInput.value = '';
      resetTimeSlots();
      return;
    }
    if (day === 1) {
      showToast('⚠️ A barbearia fecha às segundas-feiras. Atendimento de terça a sexta-feira.');
      dateInput.value = '';
      resetTimeSlots();
      return;
    }

    const feriado = getFeriado(dateInput.value);
    if (feriado) {
      showToast(`⚠️ Fechado no feriado: ${feriado}. Atendimento de terça a sexta-feira em dias úteis.`);
      dateInput.value = '';
      resetTimeSlots();
      return;
    }

    loadAvailableTimeSlots(dateInput.value, day);
  });
}

// Gera e carrega horários disponíveis para a data, unidade e barbeiro em tempo real
async function loadAvailableTimeSlots(dateStr, dayOfWeek) {
  const timeSelect = document.getElementById('booking-time');
  const unitSelect = document.getElementById('booking-unit');
  const barberSelect = document.getElementById('booking-barber');
  const serviceSelect = document.getElementById('booking-service');
  const slotsBadge = document.getElementById('slots-badge');
  if (!timeSelect || !dateStr) return;

  const currentSelectedTime = timeSelect.value;
  timeSelect.innerHTML = '<option value="">Atualizando horários em tempo real...</option>';

  const maxHour = 19;
  const slots = [];
  
  for (let h = 9; h < maxHour; h++) {
    const hourStr = String(h).padStart(2, '0');
    slots.push(`${hourStr}:00`);
    slots.push(`${hourStr}:30`);
  }

  const unit = unitSelect ? unitSelect.value : 'matriz';
  const barber = barberSelect ? barberSelect.value : '';
  const selectedServiceOpt = (serviceSelect && serviceSelect.selectedIndex >= 0) ? serviceSelect.options[serviceSelect.selectedIndex] : null;
  const duracaoMin = selectedServiceOpt ? parseInt(selectedServiceOpt.getAttribute('data-duration') || '30', 10) : 30;

  try {
    const params = new URLSearchParams({
      data: dateStr,
      unidade: unit,
      profissional: barber,
      duracaoMin: duracaoMin
    });

    const res = await fetch(`/api/agendamentos?${params.toString()}`);
    const data = await res.json();

    if (data.fechado) {
      timeSelect.innerHTML = `<option value="">${data.motivoFechado || 'Fechado nesta data'}</option>`;
      if (slotsBadge) {
        slotsBadge.textContent = `(${data.motivoFechado || 'Fechado'})`;
        slotsBadge.style.color = '#ef4444';
      }
      return;
    }

    const ocupados = data.horariosOcupados || [];
    const conflitosDuracao = data.conflitosDuracao || [];

    timeSelect.innerHTML = '<option value="">Selecione um horário disponível</option>';
    let livresCount = 0;

    slots.forEach(slot => {
      const isOcupado = ocupados.includes(slot);
      const isConflitoDuracao = (duracaoMin > 30 && conflitosDuracao.includes(slot));

      const [h, m] = slot.split(':').map(Number);
      const slotEndMin = h * 60 + m + duracaoMin;
      const exceedsBusinessHours = (slotEndMin > maxHour * 60);

      const opt = document.createElement('option');
      opt.value = slot;

      if (isOcupado) {
        opt.textContent = `${slot} (✕ Ocupado)`;
        opt.disabled = true;
      } else if (isConflitoDuracao) {
        opt.textContent = `${slot} (✕ Indisponível - precisa de ${duracaoMin} min livres)`;
        opt.disabled = true;
      } else if (exceedsBusinessHours) {
        opt.textContent = `${slot} (✕ Fora do Expediente)`;
        opt.disabled = true;
      } else {
        opt.textContent = `${slot} (✓ Disponível)`;
        opt.disabled = false;
        livresCount++;
      }

      // Restaura seleção anterior se continuar disponível
      if (currentSelectedTime === slot && !opt.disabled) {
        opt.selected = true;
      }

      timeSelect.appendChild(opt);
    });

    if (slotsBadge) {
      if (livresCount > 0) {
        slotsBadge.textContent = `(${livresCount} horário${livresCount > 1 ? 's' : ''} livre${livresCount > 1 ? 's' : ''})`;
        slotsBadge.style.color = '#10b981';
      } else {
        slotsBadge.textContent = '(Dia lotado - escolha outra data)';
        slotsBadge.style.color = '#ef4444';
      }
    }
  } catch (err) {
    console.error('Erro ao buscar horários:', err);
    timeSelect.innerHTML = '<option value="">Erro ao carregar horários</option>';
    if (slotsBadge) slotsBadge.textContent = '';
  }
}

function resetTimeSlots() {
  const timeSelect = document.getElementById('booking-time');
  const slotsBadge = document.getElementById('slots-badge');
  if (timeSelect) {
    timeSelect.innerHTML = '<option value="">Selecione primeiro uma data válida</option>';
  }
  if (slotsBadge) {
    slotsBadge.textContent = '';
  }
}

// 3. Inicialização e Submissão do Formulário de Agendamento
function initBookingForm() {
  const form = document.getElementById('booking-form');
  if (!form || form.dataset.initialized === 'true') return;
  form.dataset.initialized = 'true';

  const serviceSelect = document.getElementById('booking-service');
  const unitSelect = document.getElementById('booking-unit');
  const barberSelect = document.getElementById('booking-barber');
  const summaryService = document.getElementById('summary-service');
  const summaryUnit = document.getElementById('summary-unit');
  const summaryPrice = document.getElementById('summary-price');
  const dateInput = document.getElementById('booking-date');
  const timeSelect = document.getElementById('booking-time');

  if (serviceSelect) {
    serviceSelect.addEventListener('change', () => {
      const selectedOpt = serviceSelect.options[serviceSelect.selectedIndex];
      const price = selectedOpt ? selectedOpt.getAttribute('data-price') || '30.00' : '30.00';
      const serviceName = selectedOpt ? selectedOpt.text.split(' - ')[0] : 'Serviço Selecionado';

      if (summaryService) summaryService.textContent = serviceName;
      if (summaryPrice) summaryPrice.textContent = `R$ ${Number(price).toFixed(2)}`;

      // Recalcula disponibilidade de slots considerando a duração do serviço selecionado
      if (dateInput && dateInput.value) {
        const [ano, mes, dia] = dateInput.value.split('-').map(Number);
        const day = new Date(ano, mes - 1, dia, 12, 0, 0).getDay();
        loadAvailableTimeSlots(dateInput.value, day);
      }
    });
  }

  // Pre-seleção automática e rolagem precisa ao clicar nos cards de serviços
  document.querySelectorAll('.btn-choose-service').forEach(btn => {
    btn.addEventListener('click', () => {
      const sId = btn.getAttribute('data-service');
      if (serviceSelect && sId) {
        serviceSelect.value = sId;
        serviceSelect.dispatchEvent(new Event('change'));
      }
      const bookingSec = document.getElementById('agendamento');
      if (bookingSec) {
        bookingSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  if (unitSelect) {
    unitSelect.addEventListener('change', () => {
      const isFilial = unitSelect.value === 'filial';
      if (summaryUnit) {
        summaryUnit.textContent = isFilial ? 'Filial: R. Alfredo Mariano, 24' : 'Matriz: R. Francisco Mota, 93';
      }

      // Se for Filial, ajusta os profissionais disponíveis
      if (barberSelect) {
        if (isFilial) {
          barberSelect.value = 'Equipe Especializada da Casa';
        }
      }

      // Recarrega horários se houver data selecionada
      if (dateInput && dateInput.value) {
        const [ano, mes, dia] = dateInput.value.split('-').map(Number);
        const day = new Date(ano, mes - 1, dia, 12, 0, 0).getDay();
        loadAvailableTimeSlots(dateInput.value, day);
      }
    });
  }

  if (barberSelect) {
    barberSelect.addEventListener('change', () => {
      // Se selecionou o Joel, assegura que a unidade seja a Matriz
      if (barberSelect.value.includes('Joel') && unitSelect && unitSelect.value === 'filial') {
        unitSelect.value = 'matriz';
        if (summaryUnit) summaryUnit.textContent = 'Matriz: R. Francisco Mota, 93';
      }

      if (dateInput && dateInput.value) {
        const [ano, mes, dia] = dateInput.value.split('-').map(Number);
        const day = new Date(ano, mes - 1, dia, 12, 0, 0).getDay();
        loadAvailableTimeSlots(dateInput.value, day);
      }
    });
  }

  // Atualização em tempo real quando o cliente clica no seletor de horários
  if (timeSelect) {
    timeSelect.addEventListener('focus', () => {
      if (dateInput && dateInput.value) {
        const [ano, mes, dia] = dateInput.value.split('-').map(Number);
        const day = new Date(ano, mes - 1, dia, 12, 0, 0).getDay();
        loadAvailableTimeSlots(dateInput.value, day);
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const consentCheck = document.getElementById('consent-lgpd');
      if (consentCheck && !consentCheck.checked) {
        showToast('⚠️ É necessário concordar com os Termos e a Política de Privacidade (LGPD).');
        consentCheck.focus();
        return;
      }

      const nome = document.getElementById('client-name').value.trim();
      const telefone = document.getElementById('client-phone').value.trim();
      const servicoOpt = serviceSelect.options[serviceSelect.selectedIndex];
      const servico = servicoOpt.text.split(' - ')[0];
      const preco = parseFloat(servicoOpt.getAttribute('data-price')) || 30.00;
      const unidade = unitSelect ? unitSelect.value : 'matriz';
      const profissional = barberSelect ? barberSelect.value : 'Joel (Fundador & Barbeiro Titular)';
      const data = dateInput ? dateInput.value : '';
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
          servicoId: servicoOpt.value,
          servico,
          unidade,
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
          // Se for conflito de horário concorrente (outro cliente acabou de reservar)
          if (res.status === 409 || result.conflict) {
            showToast(`⚠️ Horário das ${horario} acabou de ser reservado por outro cliente.`);
            const [ano, mes, dia] = data.split('-').map(Number);
            const day = new Date(ano, mes - 1, dia, 12, 0, 0).getDay();
            await loadAvailableTimeSlots(data, day);
            if (timeSelect) timeSelect.focus();
            return;
          }
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

function formatCanonicalWhatsappUrl(agendamento) {
  const msg = 
`💈 *AGENDAMENTO CONFIRMADO - BARBEARIA DO JOEL* 💈
📌 *Protocolo:* #${agendamento.id}
👤 *Cliente:* ${agendamento.clienteNome}
📞 *WhatsApp:* ${agendamento.clienteTelefone}
✂️ *Serviço:* ${agendamento.servico}
📅 *Data:* ${agendamento.data}
⏰ *Horário:* ${agendamento.horario}
💰 *Valor Confirmado:* R$ ${Number(agendamento.preco).toFixed(2)}
📍 *Endereço:* ${agendamento.unidadeTitulo || 'Unidade Matriz'} (${agendamento.unidadeEndereco || 'Rua Francisco Mota, 93'})
💈 *Profissional:* ${agendamento.profissional}

_Por favor, confirme o recebimento do meu agendamento!_`;

  return `https://wa.me/5521982156025?text=${encodeURIComponent(msg)}`;
}

function openConfirmationModal(agendamento, whatsappUrl) {
  currentWhatsappUrl = whatsappUrl || formatCanonicalWhatsappUrl(agendamento);
  const modal = document.getElementById('pix-modal');
  const modalDetails = document.getElementById('modal-booking-details');
  const btnZap = document.getElementById('modal-btn-whatsapp');

  if (modalDetails) {
    modalDetails.innerHTML = `
      <p><strong>Protocolo:</strong> #${agendamento.id}</p>
      <p><strong>Cliente:</strong> ${agendamento.clienteNome}</p>
      <p><strong>Unidade:</strong> ${agendamento.unidadeTitulo} (${agendamento.unidadeEndereco})</p>
      <p><strong>Serviço:</strong> ${agendamento.servico}</p>
      <p><strong>Profissional:</strong> ${agendamento.profissional}</p>
      <p><strong>Data & Horário:</strong> ${agendamento.data} às ${agendamento.horario}</p>
      <p><strong>Total:</strong> R$ ${Number(agendamento.preco).toFixed(2)}</p>
    `;
  }

  if (btnZap) {
    btnZap.href = currentWhatsappUrl;
    btnZap.setAttribute('target', '_blank');
    btnZap.setAttribute('rel', 'noopener noreferrer');
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

// 7. Modal de Cancelamento de Agendamento pelo Cliente
function initCancelModal() {
  const openBtn = document.getElementById('btn-open-cancel-modal');
  const modal = document.getElementById('cancel-modal');
  const closeBtn = document.getElementById('cancel-modal-close');
  const form = document.getElementById('cancel-form');
  const msgDiv = document.getElementById('cancel-msg');

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => {
      modal.classList.add('active');
      if (msgDiv) msgDiv.style.display = 'none';
      if (form) form.reset();
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

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('cancel-input-id').value.trim();
      const telefone = document.getElementById('cancel-input-phone').value.trim();

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Processando cancelamento...';

      try {
        const res = await fetch('/api/agendamentos/cancelar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, telefone })
        });
        const data = await res.json();

        msgDiv.style.display = 'block';
        if (data.success) {
          msgDiv.style.color = '#34d399';
          msgDiv.textContent = `✓ ${data.message}`;
          showToast('✓ Agendamento cancelado com sucesso.');

          // Recarrega horários se houver data no formulário principal
          const dateInput = document.getElementById('booking-date');
          if (dateInput && dateInput.value) {
            const [ano, mes, dia] = dateInput.value.split('-').map(Number);
            const day = new Date(ano, mes - 1, dia, 12, 0, 0).getDay();
            loadAvailableTimeSlots(dateInput.value, day);
          }
          setTimeout(() => {
            modal.classList.remove('active');
          }, 2500);
        } else {
          msgDiv.style.color = '#ef4444';
          msgDiv.textContent = `✕ ${data.error || 'Erro ao cancelar.'}`;
        }
      } catch (err) {
        msgDiv.style.display = 'block';
        msgDiv.style.color = '#ef4444';
        msgDiv.textContent = 'Erro de conexão com o servidor.';
      } finally {
        btn.disabled = false;
        btn.textContent = '✕ Cancelar este Agendamento';
      }
    });
  }
}
