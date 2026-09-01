require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const crypto = require('crypto');

const { purchaseVps, waitForVpsReady, createSubdomainRecord } = require('./lib/hostinger');
const { slugify, randomSuffix } = require('./lib/slug');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();

// Stripe necesita el body RAW (sin parsear) para validar la firma del webhook
app.post(
  '/webhook/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Firma de webhook invalida:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Responde rapido a Stripe; el aprovisionamiento sigue en segundo plano
    res.status(200).send('ok');

    if (event.type !== 'checkout.session.completed') return;

    const session = event.data.object;

    // Espera que al crear el Checkout Session hayas mandado esto en metadata:
    // metadata: { client_name: "Restaurante El Buen Sabor", client_email: "..." }
    const clientName = session.metadata?.client_name;
    const clientEmail = session.customer_details?.email || session.metadata?.client_email;

    if (!clientName) {
      console.error('El evento de Stripe no trae metadata.client_name, no puedo aprovisionar.');
      return;
    }

    try {
      await provisionClient({ clientName, clientEmail });
    } catch (err) {
      console.error(`Fallo el aprovisionamiento para "${clientName}":`, err);
      // TODO: avisar por Slack/email al equipo para intervencion manual
    }
  }
);

app.use(express.json());

async function provisionClient({ clientName, clientEmail }) {
  const subdomain = `${slugify(clientName)}-${randomSuffix()}`;
  const fullUrl = `https://${subdomain}.${process.env.BASE_DOMAIN}`;
  const rootPassword = crypto.randomBytes(12).toString('base64url');

  console.log(`[provision] Comprando VPS para ${clientName} (${fullUrl})...`);

  const vm = await purchaseVps({
    hostname: `${subdomain}.${process.env.BASE_DOMAIN}`,
    password: rootPassword,
    publicKey: process.env.HOSTINGER_ADMIN_SSH_PUBLIC_KEY,
    postInstallScriptId: process.env.HOSTINGER_POST_INSTALL_SCRIPT_ID,
  });

  console.log(`[provision] VPS creado con id=${vm.id}, esperando a que quede listo...`);

  const readyVm = await waitForVpsReady(vm.id);
  const ip = readyVm.ipv4[0].address;

  console.log(`[provision] VPS listo en ${ip}, creando DNS...`);

  await createSubdomainRecord(subdomain, ip);

  console.log(`[provision] Listo: ${fullUrl} -> ${ip}`);

  // TODO:
  //  - guardar en tu base de datos: cliente, vm.id, subdomain, ip, rootPassword (cifrada)
  //  - si usas un post_install_script_id, este ya dejo el servicio corriendo (ej. docker run ...)
  //  - notificar al cliente por email/WhatsApp con la URL ya lista
  //  - el DNS puede tardar unos minutos en propagar antes de que fullUrl responda
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor de aprovisionamiento escuchando en :${port}`));
