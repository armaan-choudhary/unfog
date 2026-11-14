export interface S3UploadResult {
  key: string;
  url: string;
  size: number;
  etag: string;
}

export interface S3ClientConfig {
  bucket: string;
  region: string;
  endpoint?: string;
}

const defaultConfig: S3ClientConfig = {
  bucket: process.env.S3_BUCKET_NAME || 'unfog-fixtures-bucket',
  region: process.env.AWS_REGION || 'us-east-1',
};

/**
 * Upload binary payload directly to S3 storage bucket
 */
export async function uploadToS3(
  key: string,
  buffer: Buffer | Uint8Array,
  contentType: string = 'application/octet-stream'
): Promise<S3UploadResult> {
  const sanitizedKey = key.replace(/^\/+/, '');
  const url = `https://${defaultConfig.bucket}.s3.${defaultConfig.region}.amazonaws.com/${sanitizedKey}`;
  const size = buffer.byteLength;
  const etag = `"${Math.random().toString(16).substring(2, 18)}"`;

  // Simulated S3 putObject operation
  return {
    key: sanitizedKey,
    url,
    size,
    etag,
  };
}

/**
 * Generate a pre-signed URL for direct client-side uploads or downloads
 */
export async function generatePresignedUrl(
  key: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const sanitizedKey = key.replace(/^\/+/, '');
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  return `https://${defaultConfig.bucket}.s3.${defaultConfig.region}.amazonaws.com/${sanitizedKey}?expires=${expiresAt}&signature=mock_sig`;
}

/**
 * Delete an object from S3
 */
export async function deleteFromS3(key: string): Promise<boolean> {
  const sanitizedKey = key.replace(/^\/+/, '');
  // Simulated S3 deleteObject operation
  return sanitizedKey.length > 0;
}
