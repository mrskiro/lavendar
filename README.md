# Lavendar

Notify LINE bot of google calendar changes.

- Cloudflare
  - [Workers](https://developers.cloudflare.com/workers/)
  - [D1](https://developers.cloudflare.com/d1/)
  - [Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Google Calendar API](https://developers.google.com/calendar/api/guides/overview?hl=ja)
- [LINE Messaging API](https://developers.line.biz/ja/docs/messaging-api/)
- [Tempo](https://github.com/formkit/tempo)

## Getting Started

```bash
yarn install
cp wrangler.toml.example wrangler.toml
cp .dev.vars.example .dev.vars
```

Add your wrangler infomation to `wrangler.toml`, And token and secrets to `.dev.vars`

### Testing Cron

```bash
yarn dev:cron
// Ready on http://localhost:xxxxx
curl "http://localhost:xxxxx/__scheduled?cron=*+*+*+*+*"
```

### Execute SQL

```bash
npx wrangler d1 execute your-db --local --command="SELECT * FROM calendars"
```

### Secrets

#### GOOGLE_CREDENTIALS

1. From [here](https://console.cloud.google.com/iam-admin/serviceaccounts), issue a service account key and download the json file.
2. Run `cat <your>.json | base64` and copy and paste the output values into `.dev.vars`

### Escape hatch

If extra notification channels are added during debugging, you can remove them below.

```
curl -X DELETE \
  -H "Content-Type: application/json" \
  -d '{
    "id": "xxx",
    "resourceId": "xxx"
  }' \
  https://your-api/calendars/channel
```

### TODO

- [ ] testing
- [ ] linter & formatter
