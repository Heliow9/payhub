# PayHub 0.4.2 — Deploy

## 1. Atualizar o projeto

No servidor Lightsail:

```bash
cd /var/www/payhub
git pull --ff-only origin main
npm install
```

## 2. Variáveis de ambiente

A 0.4.2 pode fazer geocodificação reversa das coordenadas coletadas no ato da assinatura.

Adicione ao `.env` se ainda não existirem:

```env
REVERSE_GEOCODING_ENABLED=true
REVERSE_GEOCODING_URL=https://nominatim.openstreetmap.org/reverse
```

Não há migration nova específica da 0.4.2. A migration mais recente continua sendo `004_notifications.sql`.

## 3. Validar e reiniciar

```bash
npm run db:migrate
npm test
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 status
```

Depois faça `Ctrl+F5` no navegador. No PWA instalado, feche e abra novamente para atualizar o Service Worker.

## 4. Android

A versão Android da 0.4.2 usa permissões nativas de localização e envia informações do aparelho para compor a evidência da assinatura.

Na pasta `apps/android`, gere uma nova APK/AAB usando o Android Studio/Gradle do seu ambiente. O Android poderá exibir o prompt oficial do sistema operacional para localização. O PayHub não adiciona uma pergunta própria antes da assinatura.

## 5. Evidência da assinatura

No ato da assinatura, quando disponível, serão registrados:

- IP da requisição;
- data/hora UTC e BRT;
- origem Portal/PWA/Android;
- User-Agent;
- tipo, marca, fabricante e modelo do aparelho;
- sistema operacional e versão;
- navegador/app e versão;
- resolução, pixel ratio, idioma e fuso;
- latitude, longitude e precisão;
- endereço aproximado por geocodificação reversa;
- hashes do PDF original, PDF assinado e evidência;
- assinatura desenhada separada, quando utilizada.

Se a localização não estiver disponível ou a permissão do sistema for negada, a assinatura não é bloqueada; o motivo fica registrado na evidência.

## 6. Exportação em lote

Na Central de holerites, selecione os documentos e use **Exportar PDFs selecionados**. O ZIP utiliza automaticamente:

- PDF assinado, quando existir;
- PDF original, quando ainda não estiver assinado;
- `manifesto.csv` com competência, status, tipo de documento e SHA-256.
