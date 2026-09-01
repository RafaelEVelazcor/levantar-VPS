const axios = require('axios');

const BASE_URL = 'https://api.hostinger.com/api';

function client() {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${process.env.HOSTINGER_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    timeout: 30_000,
  });
}

/**
 * Compra + configura un VPS nuevo en un solo llamado.
 * Requiere que la cuenta de Hostinger ya tenga un metodo de pago
 * guardado (si no se pasa payment_method_id, usa el default).
 *
 * Devuelve el objeto del VPS creado (incluye su id).
 */
async function purchaseVps({ hostname, password, publicKey, postInstallScriptId }) {
  const api = client();

  const setup = {
    template_id: Number(process.env.HOSTINGER_TEMPLATE_ID),
    hostname,
    password,
  };

  if (publicKey) {
    setup.public_key = { key: publicKey };
  }
  if (postInstallScriptId) {
    setup.post_install_script_id = Number(postInstallScriptId);
  }

  const { data } = await api.post('/vps/v1/virtual-machines/purchase', {
    item_id: process.env.HOSTINGER_VPS_ITEM_ID,
    setup,
  });

  return data; // { id, state, ... }
}

/**
 * Espera a que el VPS termine de aprovisionarse y tenga IP asignada.
 * Hace polling simple; en produccion conviene mover esto a un job/cola
 * en vez de bloquear el webhook.
 */
async function waitForVpsReady(vmId, { intervalMs = 10_000, maxTries = 60 } = {}) {
  const api = client();

  for (let i = 0; i < maxTries; i++) {
    const { data: vm } = await api.get(`/vps/v1/virtual-machines/${vmId}`);

    if (vm.state === 'running' && vm.ipv4?.length) {
      return vm;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`El VPS ${vmId} no quedo listo despues de esperar.`);
}

/**
 * Crea (o actualiza) el registro A de <subdomain>.<BASE_DOMAIN> -> ip
 * sin borrar el resto de la zona.
 */
async function createSubdomainRecord(subdomain, ip) {
  const api = client();

  await api.put(`/dns/v1/zones/${process.env.BASE_DOMAIN}`, {
    overwrite: false,
    zone: [
      {
        name: subdomain, // ej. "cliente1" -> cliente1.reservai.com.mx
        type: 'A',
        ttl: 3600,
        records: [{ content: ip }],
      },
    ],
  });
}

module.exports = { purchaseVps, waitForVpsReady, createSubdomainRecord };
