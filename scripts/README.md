# Smoke test voix (sans front)

Ce script valide rapidement le signaling du gateway `voice-chat` (join/leave/toggle).

## Prerequis

- Le backend tourne localement.
- Le namespace `voice-chat` est expose.

## Execution

```powershell
npm run smoke:voice
```

## Variables optionnelles

```powershell
$env:VOICE_CHAT_URL="http://localhost:3000/voice-chat"
$env:ROOM_ID="room-1"
$env:USER_ID="user-1"
```

Puis relancez la commande `npm run smoke:voice`.
