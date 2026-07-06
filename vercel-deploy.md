# Vercel Deployment Procedure For This Repo

This document is for future LLM agents working in `/Users/daisy/develop/songs-backend`.

## Vercel Project

Use the existing Vercel project metadata in `.vercel/repo.json`.

Project metadata:

- Project name: `songs-backend`
- Project id: `prj_a75JRJZVZM0LQjLrrcpWF0Kljd1A`
- Team/org id: `team_ZrcqXY1jN6slzv9eIm0mSghZ`
- Production alias: `https://songs.petals.top`
- Project metadata file: `.vercel/repo.json`

Metadata file content:

```json
{
  "remoteName": "origin",
  "projects": [
    {
      "id": "prj_a75JRJZVZM0LQjLrrcpWF0Kljd1A",
      "name": "songs-backend",
      "directory": ".",
      "orgId": "team_ZrcqXY1jN6slzv9eIm0mSghZ"
    }
  ]
}
```

## Vercel Environment Variables

The Vercel project has these environment variable names:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `SONGLIST_PASSWORD`
- `GIST_ID`
- `GIST_TOKEN`

The app uses `Redis.fromEnv()`, so production requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

Check environment variable names with:

```bash
npx --yes vercel env ls --scope team_ZrcqXY1jN6slzv9eIm0mSghZ
```

Keep secret values redacted in logs and final responses.

## Redis Target

Use the existing Upstash Redis configured by the Vercel environment variables.

Current app keys:

- `songlist`: song data
- `prompt-wall`: prompt wall data
- `backblaze:audio-config`: Backblaze audio bucket config

Audio metadata is stored with each song in `songlist`. Audio bytes are stored in Backblaze. The API returns base64 to the frontend after reading MP3 bytes from Backblaze.

## Backblaze Audio Storage

Audio storage uses the dedicated Backblaze bucket.

Bucket metadata:

- Bucket name: `daisy-songs-audio`
- Bucket id: `2b6c325f997c376a9bf60c11`
- Endpoint: `s3.us-west-004.backblazeb2.com`
- Region: `us-west-004`
- Type: Private

Scoped key name:

- `songs-backend-audio-daisy-songs-audio`

Local scratch config, when present, is stored under:

```text
.codex-work/backblaze-audio-config.json
```

`.codex-work/` is ignored by git.

## Redis Backblaze Config

Redis key:

```text
backblaze:audio-config
```

Expected value shape:

```json
{
  "endpoint": "s3.us-west-004.backblazeb2.com",
  "bucketName": "daisy-songs-audio",
  "keyId": "<Backblaze key id>",
  "applicationKey": "<Backblaze application key>",
  "region": "us-west-004"
}
```

Use a repo-local script under `.codex-work/` for Redis writes. Load local Redis env from `.env.local` when running from this machine.

## Build Check

Run from the repo root:

```bash
npm run build
```

Expected app routes:

- `/`
- `/api/backup-redis-to-gist`
- `/api/songs`
- `/api/songs/[id]`
- `/api/songs/[id]/audio`

## Production Deploy Command

Run from the repo root:

```bash
npx --yes vercel deploy --prod --yes --scope team_ZrcqXY1jN6slzv9eIm0mSghZ
```

Expected deployment state:

- Target: `production`
- Status: `READY`
- Alias includes `https://songs.petals.top`

Inspect a deployment with:

```bash
npx --yes vercel inspect <deployment-url> --scope team_ZrcqXY1jN6slzv9eIm0mSghZ
```

Use the deployment URL returned by the deploy command.

## Production Audio Verification

Production URL:

```text
https://songs.petals.top
```

Verification sequence:

1. Create a temporary song through `POST /api/songs`.
2. Upload a real MP3 through `PUT /api/songs/:id/audio`.
3. Confirm the returned song has `hasAudio: true`.
4. Confirm `audioMeta.objectKey` is `song-audio/<songId>.mp3`.
5. Confirm the Backblaze object exists in `daisy-songs-audio`.
6. Fetch `GET /api/songs/:id/audio`.
7. Decode the returned base64 and compare bytes with the uploaded MP3.
8. Delete audio through `DELETE /api/songs/:id/audio`.
9. Confirm the Backblaze object no longer exists.
10. Delete the temporary song through `DELETE /api/songs/:id`.

Expected audio object key pattern:

```text
song-audio/<songId>.mp3
```

## Completion Evidence

Current completed deployment evidence:

- `npm run build` passed locally.
- Vercel production deploy completed.
- Vercel production alias included `https://songs.petals.top`.
- `backblaze:audio-config` was written to the existing Redis.
- Production verification created a temporary song, uploaded MP3 audio, verified Backblaze object creation, fetched the audio back from production, byte-compared it, deleted the audio, verified Backblaze object deletion, and deleted the temporary song.
