import { uploadToS3, S3UploadResult } from '../../../lib/s3';
import { createUploadRecord, getUserById, UploadRecord } from '../../../lib/db';

export interface UploadApiResponse {
  success: boolean;
  record?: UploadRecord;
  s3Info?: S3UploadResult;
  error?: string;
}

export interface UploadInput {
  userId: string;
  filename: string;
  contentType: string;
  data: Buffer | Uint8Array;
}

/**
 * Core business logic for handling an upload:
 * 1. Validates the user exists in the database
 * 2. Uploads binary data to S3
 * 3. Records the uploaded asset in the database
 */
export async function handleUpload(input: UploadInput): Promise<UploadApiResponse> {
  const { userId, filename, contentType, data } = input;

  // 1. Verify user exists
  const user = await getUserById(userId);
  if (!user) {
    return { success: false, error: `User ${userId} not found` };
  }

  // 2. Upload file payload to S3
  const s3Key = `uploads/${userId}/${Date.now()}-${filename}`;
  const s3Result = await uploadToS3(s3Key, data, contentType);

  // 3. Persist record to database
  const record = await createUploadRecord({
    userId,
    filename,
    s3Key: s3Result.key,
    size: s3Result.size,
    url: s3Result.url,
  });

  return {
    success: true,
    record,
    s3Info: s3Result,
  };
}

/**
 * Next.js App Router Route Handler for POST /api/upload
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const userId = (formData.get('userId') as string) || 'usr_1';

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await handleUpload({
      userId,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      data: buffer,
    });

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Upload route error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
