export const ATTENDANTS = [
  { id: 'lorena', name: 'Lorena Pimentel', whatsapp: '5521992556792' },
  { id: 'suellen', name: 'Suellen', whatsapp: '5511980490017' },
  { id: 'rodrigo', name: 'Rodrigo', whatsapp: '5524998647080' },
  { id: 'vitoria', name: 'Vitória', whatsapp: '5521972164502' },
  { id: 'debora', name: 'Débora Pimentel', whatsapp: '5521991806475' }
];

// Se o cliente quiser falar com atendente humano
export async function notifyHumanAttendant(options: {
  target: 'all' | string; // 'all' ou id/nome do atendente
  message: string;
  conversationId?: string;
  sendWhatsApp?: boolean;
  emitSocket?: boolean;
  io?: any; // Socket.IO instance
}) {
  const { target, message, conversationId, sendWhatsApp = true, emitSocket, io } = options;

  if (target === 'all') {
    // Notifica todos ao mesmo tempo
    const results = await Promise.allSettled(
      ATTENDANTS.map(async (a) => {
        const result: any = { atendentId: a.id, name: a.name };
        try {
          if (sendWhatsApp) {
            // Enviar WhatsApp para cada atendente (usando whatsappService)
            const { sendMessage } = await import('./whatsappService');
            await sendMessage(a.whatsapp, `🔔 *Atendimento Humano Solicitado*\n${message}\nConversa: ${conversationId || 'N/A'}`);
            result.whatsapp = 'enviado';
          }
          if (emitSocket && io) {
            io.emit('attendant_notification', {
              attendantId: a.id,
              name: a.name,
              message,
              conversationId,
              type: 'human_request'
            });
            result.socket = 'emitido';
          }
        } catch (e: any) {
          result.error = e.message;
        }
        return result;
      })
    );
    return {
      mode: 'all',
      notifiedCount: ATTENDANTS.length,
      results: results.map((r) => r.status === 'fulfilled' ? r.value : r.reason)
    };
  }

  // Notifica apenas o escolhido (pelo cliente ou automático)
  const chosen = ATTENDANTS.find(
    (a) => a.id === target || a.name.toLowerCase() === target.toLowerCase()
  );

  if (!chosen) {
    throw new Error(`Atendente não encontrado: ${target}. Opções: ${ATTENDANTS.map(a => a.name).join(', ')}`);
  }

  const result: any = { attendantId: chosen.id, name: chosen.name };

  try {
    if (sendWhatsApp) {
      const { sendMessage } = await import('./whatsappService');
      await sendMessage(chosen.whatsapp, `🔔 *Atendimento Humano Solicitado*\n${message}\nConversa: ${conversationId || 'N/A'}\nAtendente: ${chosen.name}`);
      result.whatsapp = 'enviado';
    }
    if (emitSocket && io) {
      io.emit('attendant_notification', {
        attendantId: chosen.id,
        name: chosen.name,
        message,
        conversationId,
        type: 'human_request'
      });
      result.socket = 'emitido';
    }
  } catch (e: any) {
    result.error = e.message;
  }

  return { mode: 'single', ...result };
}