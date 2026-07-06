import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Redis } from '@upstash/redis';

export const BACKBLAZE_AUDIO_CONFIG_KEY = 'backblaze:audio-config';

export interface BackblazeAudioConfig {
  endpoint: string;
  bucketName: string;
  keyId: string;
  applicationKey: string;
  region?: string;
}

export function getAudioObjectKey(songId: string): string {
  return `song-audio/${songId}.mp3`;
}

function normalizeEndpoint(endpoint: string): string {
  if (endpoint.startsWith('https://') || endpoint.startsWith('http://')) {
    return endpoint;
  }
  return `https://${endpoint}`;
}

function inferRegion(endpoint: string): string {
  const match = endpoint.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/i);
  return match?.[1] || 'us-west-004';
}

function createS3Client(config: BackblazeAudioConfig): S3Client {
  return new S3Client({
    region: config.region || inferRegion(config.endpoint),
    endpoint: normalizeEndpoint(config.endpoint),
    credentials: {
      accessKeyId: config.keyId,
      secretAccessKey: config.applicationKey
    }
  });
}

function assertBackblazeConfig(value: BackblazeAudioConfig | null): BackblazeAudioConfig {
  if (!value?.endpoint || !value.bucketName || !value.keyId || !value.applicationKey) {
    throw new Error(`Redis key ${BACKBLAZE_AUDIO_CONFIG_KEY} is missing Backblaze audio config`);
  }
  return value;
}

export async function getBackblazeAudioConfig(redis: Redis): Promise<BackblazeAudioConfig> {
  return assertBackblazeConfig(await redis.get<BackblazeAudioConfig>(BACKBLAZE_AUDIO_CONFIG_KEY));
}

export async function putAudioObject(config: BackblazeAudioConfig, objectKey: string, audioBuffer: Buffer): Promise<void> {
  const client = createS3Client(config);
  await client.send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: objectKey,
    Body: audioBuffer,
    ContentType: 'audio/mpeg'
  }));
}

export async function getAudioObject(config: BackblazeAudioConfig, objectKey: string): Promise<Buffer> {
  const client = createS3Client(config);
  const response = await client.send(new GetObjectCommand({
    Bucket: config.bucketName,
    Key: objectKey
  }));

  if (!response.Body) {
    throw new Error('Backblaze audio object has no body');
  }

  return Buffer.from(await response.Body.transformToByteArray());
}

export async function deleteAudioObject(config: BackblazeAudioConfig, objectKey: string): Promise<void> {
  const client = createS3Client(config);
  await client.send(new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: objectKey
  }));
}
