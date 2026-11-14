export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
}

export interface UploadRecord {
  id: string;
  userId: string;
  filename: string;
  s3Key: string;
  size: number;
  url: string;
  createdAt: string;
}

// In-memory mock database store for realistic fixture testing
const mockUsers: Map<string, User> = new Map([
  [
    'usr_1',
    {
      id: 'usr_1',
      name: 'Alice Developer',
      email: 'alice@example.com',
      role: 'admin',
      createdAt: '2024-01-15T08:00:00Z',
    },
  ],
  [
    'usr_2',
    {
      id: 'usr_2',
      name: 'Bob Builder',
      email: 'bob@example.com',
      role: 'user',
      createdAt: '2024-02-10T10:30:00Z',
    },
  ],
]);

const mockUploads: UploadRecord[] = [
  {
    id: 'upl_101',
    userId: 'usr_1',
    filename: 'design-spec.pdf',
    s3Key: 'uploads/usr_1/design-spec.pdf',
    size: 204800,
    url: 'https://storage.cloudprovider.com/bucket/uploads/usr_1/design-spec.pdf',
    createdAt: '2024-03-01T12:00:00Z',
  },
];

/**
 * Retrieve user by ID
 */
export async function getUserById(id: string): Promise<User | null> {
  return mockUsers.get(id) || null;
}

/**
 * Persist an upload record to the database
 */
export async function createUploadRecord(
  data: Omit<UploadRecord, 'id' | 'createdAt'>
): Promise<UploadRecord> {
  const newRecord: UploadRecord = {
    ...data,
    id: `upl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
  };

  mockUploads.unshift(newRecord);
  return newRecord;
}

/**
 * Get recent upload records, optionally filtered by user ID
 */
export async function getRecentUploads(userId?: string): Promise<UploadRecord[]> {
  if (userId) {
    return mockUploads.filter((item) => item.userId === userId);
  }
  return [...mockUploads];
}

/**
 * Delete an upload record by ID
 */
export async function deleteUploadRecord(id: string): Promise<boolean> {
  const index = mockUploads.findIndex((u) => u.id === id);
  if (index >= 0) {
    mockUploads.splice(index, 1);
    return true;
  }
  return false;
}
