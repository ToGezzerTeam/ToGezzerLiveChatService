# Smoke test voix (sans front)

Ce script valide rapidement le signaling du gateway `voice-chat` (join/leave/toggle).

## Prerequis

- Le backend tourne localement.
- Le namespace `voice-chat` est expose.
- Un JWT valide est disponible.

## Execution

```powershell
npm run smoke:voice
```

## Variables

Le secret JWT et le token sont des valeurs de tests qui fonctionnent spécifiquement pour ce script avec l'utilisateur 'user-1'.

```powershell
$env:VOICE_CHAT_URL="http://localhost:3000/voice-chat"
$env:ROOM_ID="room-1"
$env:USER_ID="user-1"
$env:JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJlbWFpbCI6InVzZXIuMUBleGFtcGxlLmNvbSIsInV1aWQiOiJ1c2VyLTEiLCJpZCI6MSwidXNlcm5hbWUiOiJ1c2VyLTEifQ.rfu-f1e-7YMwLBELXnqu1zlWUxtMR9Z_iJEbNs35R14"
$env:JWT_SECRET="mZBtEL2Y6EG8lCUnW76ErMLubJIS2KB9zveipYSaWiz"
```

Puis relancez la commande `npm run smoke:voice`.
