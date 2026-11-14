import { ExecutionStepData } from '../types';

export const INITIAL_TRACE_STEPS: ExecutionStepData[] = [
  {
    id: 'step-1-btn',
    stepIndex: 1,
    label: 'UploadBtn',
    file: 'components/UploadBtn.tsx',
    symbol: 'handleFileSelect',
    nodeType: 'component',
    fogState: 'clear',
    shortSummary: 'User triggers file picker; validates size and dispatches upload',
    activeFunctionCode: `  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error('File exceeds 10MB limit');
      return;
    }

    setUploading(true);
    try {
      const result = await startUpload(file);
      onUploadComplete?.(result.url);
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };`,
    fullCode: `import React, { useState, useRef } from 'react';
import { useUpload } from '../hooks/useUpload';
import { Upload, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface UploadBtnProps {
  onUploadComplete?: (url: string) => void;
  allowedTypes?: string[];
}

export function UploadBtn({ onUploadComplete, allowedTypes = ['image/*'] }: UploadBtnProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { startUpload, progress } = useUpload();

  // Active step function:
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error('File exceeds 10MB limit');
      return;
    }

    setUploading(true);
    try {
      const result = await startUpload(file);
      onUploadComplete?.(result.url);
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="relative inline-block">
      <input
        ref={fileInputRef}
        type="file"
        accept={allowedTypes.join(',')}
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        onClick={handleClick}
        disabled={uploading}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm font-medium transition-colors"
      >
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Uploading ({progress}%)...</span>
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            <span>Select File</span>
          </>
        )}
      </button>
    </div>
  );
}
`,
    targetLineRange: { start: 20, end: 38 },
    mentalModel: {
      L1: {
        trigger: 'User clicks file picker button and selects an image from their device filesystem.',
        mutation: 'Sets local button state to "uploading", disabling further clicks.',
        sideEffects: 'Delegates file streaming to `useUpload` hook and triggers toast notification on error.',
        summary: 'Entry component that handles UI feedback and enforces the 10MB client-side constraint before network transfer.',
      },
      L2: {
        trigger: 'Native `change` event on hidden `<input type="file" />` with `e.target.files[0]`.',
        mutation: '`setUploading(true)` updates React fiber state; resets in `finally` block.',
        sideEffects: 'Executes `startUpload(file)` async promise; fires parent callback `onUploadComplete(result.url)` upon HTTP 200.',
        summary: 'Controlled UI component guarding client inputs and bridging React DOM events into the application store hook.',
        technicalDetails: ['File size validation check before memory allocation', 'Progressive loading indicator with cancelable promise flow']
      },
      L3: {
        trigger: 'React synthetic change event bound to HTML5 input element; target file buffer extracted.',
        mutation: 'Triggers local state re-render for spinner and disables button element.',
        sideEffects: 'Calls `startUpload` hook which generates FormData and pushes to `/api/upload`. Calls `onUploadComplete` closure prop.',
        summary: 'Synchronous validation boundary with asynchronous error boundary wrapping child hook exceptions.',
        technicalDetails: ['SyntheticEvent pooling mitigation', 'Closure capture of onUploadComplete callback']
      }
    },
    blastRadius: {
      affectedIds: ['step-2-hook', 'step-3-api'],
      riskScore: 'low',
      description: 'Changing file size check or callback signature affects user feedback and hook invocation params.'
    },
    debtRadar: {
      hasSlop: false,
      issues: []
    },
    visualFlow: {
      inputBadge: 'File Picker (<10MB)',
      inputDetails: 'Native browser event: image/png, image/jpeg',
      processSteps: [
        'Intercepts file selection event',
        'Guards file size against 10MB limit',
        'Toggles local uploading state to true'
      ],
      outputBadge: 'startUpload(file)',
      outputDetails: 'Delegates binary file to useUpload hook',
      edgePayload: 'File (Blob)',
      stateDiff: {
        variable: 'uploading',
        before: 'false',
        after: 'true'
      }
    }
  },
  {
    id: 'step-2-hook',
    stepIndex: 2,
    label: 'useUpload',
    file: 'hooks/useUpload.ts',
    symbol: 'startUpload',
    nodeType: 'hook',
    fogState: 'fuzzy',
    shortSummary: 'Coordinates multipart FormData serialization, upload progress, and API request',
    activeFunctionCode: `  const startUpload = useCallback(async (file: File): Promise<UploadResult> => {
    setProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', file.name);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Upload failed');
    }

    const data: UploadResult = await response.json();
    setProgress(100);
    return data;
  }, []);`,
    fullCode: `import { useState, useCallback } from 'react';

export interface UploadResult {
  id: string;
  url: string;
  filename: string;
  size: number;
}

export function useUpload() {
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Active step function:
  const startUpload = useCallback(async (file: File): Promise<UploadResult> => {
    setProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', file.name);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Upload failed');
    }

    const data: UploadResult = await response.json();
    setProgress(100);
    return data;
  }, []);

  return {
    startUpload,
    progress,
    error,
  };
}
`,
    targetLineRange: { start: 14, end: 34 },
    mentalModel: {
      L1: {
        trigger: 'Called by `UploadBtn` when a valid file is submitted.',
        mutation: 'Tracks upload percentage (0% to 100%) and error state.',
        sideEffects: 'Sends an HTTP POST request with multipart form data to `/api/upload`.',
        summary: 'Client-side network orchestrator managing upload progress and status updates.',
      },
      L2: {
        trigger: 'Invocation of memoized `startUpload(file: File)`.',
        mutation: 'Resets `progress` to 0, packs binary payload into `FormData`, sets `progress` to 100 on completion.',
        sideEffects: 'Executes standard browser `fetch(\'/api/upload\')` with multipart body headers generated automatically by browser.',
        summary: 'Custom hook encapsulating upload networking, JSON deserialization, and state synchronization.',
        technicalDetails: ['FormData binary packing', 'HTTP status code error extraction']
      },
      L3: {
        trigger: 'Hook callback execution with memoization dependencies `[]`.',
        mutation: 'Triggers React render phases on progress changes.',
        sideEffects: 'Dispatches HTTP stream over TCP; waits for Next.js Route Handler JSON response.',
        summary: 'Async memoized dispatcher with typed return contract `Promise<UploadResult>`.',
        technicalDetails: ['Closure scope isolation via useCallback', 'Streaming upload cancellation not yet implemented (AI debt)']
      }
    },
    blastRadius: {
      affectedIds: ['step-1-btn', 'step-3-api'],
      riskScore: 'medium',
      description: 'Changes to UploadResult interface or /api/upload endpoint path break UploadBtn and consuming views.'
    },
    debtRadar: {
      hasSlop: true,
      issues: ['Upload progress jumps from 0 to 100 with no XMLHttpRequest/fetch streaming chunk listener.', 'Missing abort controller for user cancellation.']
    },
    visualFlow: {
      inputBadge: 'File (Blob)',
      inputDetails: 'startUpload(file) invocation from component',
      processSteps: [
        'Resets progress to 0% and clears errors',
        'Packs binary file into multipart/form-data',
        'Streams HTTP POST to /api/upload'
      ],
      outputBadge: 'POST /api/upload',
      outputDetails: 'Multipart payload with boundary & headers',
      edgePayload: 'FormData (multipart)',
      stateDiff: {
        variable: 'progress',
        before: '0%',
        after: '100%'
      }
    }
  },
  {
    id: 'step-3-api',
    stepIndex: 3,
    label: 'POST /api/upload',
    file: 'app/api/upload/route.ts',
    symbol: 'POST',
    nodeType: 'route',
    fogState: 'foggy',
    shortSummary: 'Next.js App Router handler validating session, storing to S3, and logging record',
    activeFunctionCode: `export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await uploadToS3(buffer, file.name, file.type);

    const record = await saveFileRecord({
      userId: session.user.id,
      url: uploadResult.url,
      key: uploadResult.key,
      size: file.size,
    });

    return NextResponse.json(record);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}`,
    fullCode: `import { NextResponse } from 'next/server';
import { uploadToS3 } from '@/lib/s3';
import { saveFileRecord } from '@/lib/db';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Active step function:
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await uploadToS3(buffer, file.name, file.type);

    const record = await saveFileRecord({
      userId: session.user.id,
      url: uploadResult.url,
      key: uploadResult.key,
      size: file.size,
    });

    return NextResponse.json(record);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
`,
    targetLineRange: { start: 9, end: 32 },
    mentalModel: {
      L1: {
        trigger: 'Receives the incoming HTTP POST request from `useUpload`.',
        mutation: 'Validates user authentication and extracts raw binary bytes from payload.',
        sideEffects: 'Uploads binary blob to AWS S3 bucket and persists metadata in database.',
        summary: 'Backend gatekeeper enforcing authentication and coordinating cloud storage and persistence.',
      },
      L2: {
        trigger: 'Next.js App Router route dispatcher matching `/api/upload` POST verb.',
        mutation: 'Converts `file.arrayBuffer()` into Node.js `Buffer`. Authenticates JWT via `auth()`.',
        sideEffects: 'Awaits AWS S3 PutObject command; awaits Prisma / Drizzle DB insert via `saveFileRecord`.',
        summary: 'Server-side API endpoint performing I/O multiplexing between cloud object storage and PostgreSQL.',
        technicalDetails: ['Extracts file buffer into memory (beware OOM on large files)', 'Generates file metadata in DB']
      },
      L3: {
        trigger: 'Incoming Node.js HTTP incoming message parsed as web Fetch Request spec.',
        mutation: 'Heap allocation for file buffer memory; serializes DB return entity.',
        sideEffects: 'Network I/O to AWS S3 (TCP 443) and Postgres connection pool transaction.',
        summary: 'App Router Node.js runtime handler with 30s maxDuration limit and 401/400/500 HTTP response codes.',
        technicalDetails: ['Unbounded Buffer.from arrayBuffer memory pressure', 'Prisma relational foreign key constraint to session.user.id']
      }
    },
    blastRadius: {
      affectedIds: ['step-4-s3', 'step-5-db'],
      riskScore: 'high',
      description: 'Core endpoint connecting public internet clients to AWS credentials and PostgreSQL database.'
    },
    debtRadar: {
      hasSlop: true,
      issues: ['Direct memory buffering via Buffer.from instead of streaming directly to S3 multipart upload.']
    },
    visualFlow: {
      inputBadge: 'NextRequest (multipart)',
      inputDetails: 'Incoming HTTP POST to /api/upload',
      processSteps: [
        'Validates session JWT token via auth()',
        'Extracts raw binary buffer from request body',
        'Dispatches parallel write to S3 and PostgreSQL'
      ],
      outputBadge: 'uploadToS3(buffer)',
      outputDetails: 'Awaits S3 PutObject and DB insertion',
      edgePayload: 'S3 Buffer',
      stateDiff: {
        variable: 'status',
        before: 'pending',
        after: '200 OK'
      }
    }
  },
  {
    id: 'step-4-s3',
    stepIndex: 4,
    label: 'uploadToS3',
    file: 'lib/s3.ts',
    symbol: 'uploadToS3',
    nodeType: 'service',
    fogState: 'foggy',
    shortSummary: 'Generates collision-resistant object key and pushes buffer to AWS S3 bucket',
    activeFunctionCode: `export async function uploadToS3(
  buffer: Buffer,
  originalFilename: string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const extension = originalFilename.split('.').pop() || 'bin';
  const key = \`uploads/\${randomUUID()}.\${extension}\`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(command);

  const url = \`https://\${process.env.AWS_S3_BUCKET}.s3.\${process.env.AWS_REGION}.amazonaws.com/\${key}\`;
  return { key, url };
}`,
    fullCode: `import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Active step function:
export async function uploadToS3(
  buffer: Buffer,
  originalFilename: string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const extension = originalFilename.split('.').pop() || 'bin';
  const key = \`uploads/\${randomUUID()}.\${extension}\`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(command);

  const url = \`https://\${process.env.AWS_S3_BUCKET}.s3.\${process.env.AWS_REGION}.amazonaws.com/\${key}\`;
  return { key, url };
}
`,
    targetLineRange: { start: 13, end: 31 },
    mentalModel: {
      L1: {
        trigger: 'Called by the API route handler when buffer is ready.',
        mutation: 'Generates a unique UUID filename to avoid name collisions.',
        sideEffects: 'Writes the file to AWS cloud storage and formats a public/signed CDN URL.',
        summary: 'Cloud storage adapter isolating AWS SDK credentials and bucket naming.',
      },
      L2: {
        trigger: 'Function call with parameters: `buffer`, `originalFilename`, `contentType`.',
        mutation: 'Interpolates S3 target object key prefix `uploads/{uuid}.{ext}`.',
        sideEffects: 'Sends authenticated `PutObjectCommand` via AWS SDK v3 client.',
        summary: 'Stateless cloud adapter generating storage keys and executing object PUT operations.',
        technicalDetails: ['AWS SDK v3 modular client usage', 'Collision-resistant UUID key generation']
      },
      L3: {
        trigger: 'Synchronous command preparation followed by async HTTP/2 AWS SigV4 signed request.',
        mutation: 'Generates string URL and returns immutable `{ key, url }` tuple.',
        sideEffects: 'External network boundary to Amazon S3 endpoint.',
        summary: 'Credentialed AWS client wrapping raw buffer payload into signed S3 REST request.',
        technicalDetails: ['Environment variable assertion fallback (!)', 'Missing bucket existence guard']
      }
    },
    blastRadius: {
      affectedIds: ['step-3-api'],
      riskScore: 'medium',
      description: 'Changes to bucket configuration, region, or URL structure break asset resolution.'
    },
    debtRadar: {
      hasSlop: false,
      issues: []
    },
    visualFlow: {
      inputBadge: 'S3 Buffer & Key',
      inputDetails: 'uploadToS3(buffer, filename, contentType)',
      processSteps: [
        'Generates collision-resistant UUID key prefix',
        'Builds PutObjectCommand with ContentType',
        'Sends authenticated payload via AWS SDK v3'
      ],
      outputBadge: 'S3 Cloud Object',
      outputDetails: 'https://bucket.s3.region.amazonaws.com/uploads/...',
      edgePayload: 'S3 URL & Size',
      stateDiff: {
        variable: 'storage',
        before: 'unallocated',
        after: 'persisted'
      }
    }
  },
  {
    id: 'step-5-db',
    stepIndex: 5,
    label: 'saveFileRecord',
    file: 'lib/db.ts',
    symbol: 'saveFileRecord',
    nodeType: 'db',
    fogState: 'foggy',
    shortSummary: 'Inserts file record into PostgreSQL with user ownership and timestamp',
    activeFunctionCode: `export async function saveFileRecord(data: {
  userId: string;
  url: string;
  key: string;
  size: number;
}) {
  return prisma.fileUpload.create({
    data: {
      userId: data.userId,
      url: data.url,
      storageKey: data.key,
      sizeBytes: data.size,
      status: 'READY',
      createdAt: new Date(),
    },
    select: {
      id: true,
      url: true,
      storageKey: true,
      sizeBytes: true,
      createdAt: true,
    },
  });
}`,
    fullCode: `import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

// Active step function:
export async function saveFileRecord(data: {
  userId: string;
  url: string;
  key: string;
  size: number;
}) {
  return prisma.fileUpload.create({
    data: {
      userId: data.userId,
      url: data.url,
      storageKey: data.key,
      sizeBytes: data.size,
      status: 'READY',
      createdAt: new Date(),
    },
    select: {
      id: true,
      url: true,
      storageKey: true,
      sizeBytes: true,
      createdAt: true,
    },
  });
}
`,
    targetLineRange: { start: 10, end: 32 },
    mentalModel: {
      L1: {
        trigger: 'Triggered after S3 storage succeeds to finalize ownership.',
        mutation: 'Creates a persistent database record associated with the logged-in user.',
        sideEffects: 'Writes a new row to the database and marks status as READY.',
        summary: 'Persistence layer registering file ownership in the system database.',
      },
      L2: {
        trigger: 'Execution of `saveFileRecord` with metadata payload.',
        mutation: 'Executes `INSERT INTO file_uploads` with userId foreign key reference.',
        sideEffects: 'Commits database transaction and returns safe projected fields.',
        summary: 'ORM data access layer storing audited asset records.',
        technicalDetails: ['Prisma client global singleton reuse', 'Selective field projection']
      },
      L3: {
        trigger: 'Prisma query engine client invocation.',
        mutation: 'PostgreSQL row insert with index update on userId and storageKey.',
        sideEffects: 'Connection pool checkout and SQL commit.',
        summary: 'ACID transaction inserting file record and returning typed projection.',
        technicalDetails: ['Relational integrity check on userId', 'ISO timestamp assignment on server clock']
      }
    },
    blastRadius: {
      affectedIds: ['step-3-api'],
      riskScore: 'high',
      description: 'Changes to fileUpload schema require database migration and affect all file queries.'
    },
    debtRadar: {
      hasSlop: false,
      issues: []
    },
    visualFlow: {
      inputBadge: 'Metadata Record',
      inputDetails: 'saveFileRecord({ userId, url, key, size })',
      processSteps: [
        'Validates relational foreign key to user',
        'Constructs Prisma fileUpload.create query',
        'Executes ACID commit in PostgreSQL'
      ],
      outputBadge: 'PostgreSQL Row #1042',
      outputDetails: 'Status READY with indexed storageKey and timestamp',
      edgePayload: 'DB Record (Ready)',
      stateDiff: {
        variable: 'db_records',
        before: 'N',
        after: 'N + 1'
      }
    }
  }
];
