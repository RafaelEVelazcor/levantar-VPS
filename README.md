# ReservAI - Aprovisionamiento automatico (subdominio + VPS por cliente)

Cuando un cliente completa el pago en Stripe, este servicio:

1. Recibe el webhook `checkout.session.completed`.
2. Compra y configura un VPS nuevo en Hostinger (`POST /vps/v1/virtual-machines/purchase`,
   que en un solo llamado hace la compra Y el setup: sistema operativo, hostname,
   password, llave SSH y, opcionalmente, un script post-instalacion).
3. Espera a que el VPS quede `running` y tenga IP.
4. Crea el registro DNS `A` de `<slug-del-cliente>.reservai.com.mx` apuntando a esa IP.
5. Deja listo el terreno para notificar al cliente y para que tu servicio arranque
   (idealmente via el `post_install_script`, ver mas abajo).

## Antes de correrlo (pasos que se hacen UNA sola vez)

Necesitas 4 datos de tu cuenta de Hostinger. Instala el CLI oficial y ejecuta:

```bash
brew install hostinger/tap/hostinger   # o el binario para tu plataforma
export HOSTINGER_API_TOKEN=xxxx        # token generado en hPanel > Cuenta > API

# 1) item_id del plan de VPS que vas a vender/usar
hostinger billing catalog list

# 2) template_id del sistema operativo/imagen (ej. Ubuntu 22.04, o una imagen con Docker)
hostinger vps templates list

# 3) (opcional pero recomendado) sube un script post-instalacion en hPanel
#    que instale Docker, clone tu repo/imagen y arranque el servicio del cliente.
hostinger vps post-install-scripts list

# 4) confirma que tu cuenta ya tenga un metodo de pago guardado por default,
#    para que la compra pueda hacerse sin intervencion manual:
hostinger billing payment-methods list
```

Copia esos IDs a tu `.env` (ver `.env.example`).

**IMPORTANTE:** `purchase` cobra dinero real de tu metodo de pago guardado. Prueba
primero en un entorno/cuenta de sandbox si Hostinger te da uno, o con un plan barato,
antes de conectarlo a produccion.

## Configurar Stripe

Al crear el Checkout Session de cobro, manda el nombre del cliente en metadata:

```js
await stripe.checkout.sessions.create({
  // ...
  metadata: { client_name: 'Restaurante El Buen Sabor' },
});
```

Y registra el endpoint `/webhook/stripe` en el dashboard de Stripe (o con `stripe listen`
en desarrollo) para el evento `checkout.session.completed`.

## Correrlo

```bash
cp .env.example .env   # llena los valores
npm install
npm start
```

## Notas / siguientes pasos

- El polling de `waitForVpsReady` bloquea el proceso mientras espera (puede tardar
  1-3 minutos). Para producción real, muévelo a una cola (BullMQ, etc.) en vez de
  esperar dentro del webhook.
- Guarda en tu base de datos el `vm.id`, el subdominio y la IP de cada cliente —
  los vas a necesitar para dar de baja/renovar/reinstalar despues.
- El `post_install_script` es la pieza clave para que el servicio del cliente quede
  "andando" sin que tú entres por SSH: ahí van los comandos que instalan Docker,
  bajan tu imagen y la corren en el puerto correcto.
- El DNS puede tardar unos minutos en propagar (TTL 3600 en el ejemplo); si quieres
  que responda casi al instante, baja el TTL a 300 o usa un proxy tipo Cloudflare
  delante del subdominio.
- Considera además avisar al cliente por email/WhatsApp cuando `fullUrl` ya responda
  (puedes hacer un `GET` de health-check antes de notificar).
