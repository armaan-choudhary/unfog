import { User, UploadRecord } from './db';

export interface AppState {
  currentUser: User | null;
  isUploading: boolean;
  uploadProgress: number;
  recentUploads: UploadRecord[];
  error: string | null;
}

type Listener = () => void;

// Initial state
let state: AppState = {
  currentUser: {
    id: 'usr_1',
    name: 'Alice Developer',
    email: 'alice@example.com',
    role: 'admin',
    createdAt: '2024-01-15T08:00:00Z',
  },
  isUploading: false,
  uploadProgress: 0,
  recentUploads: [],
  error: null,
};

const listeners = new Set<Listener>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export const store = {
  getState(): AppState {
    return state;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setCurrentUser(user: User | null): void {
    state = { ...state, currentUser: user };
    emitChange();
  },

  setIsUploading(isUploading: boolean): void {
    state = { ...state, isUploading };
    emitChange();
  },

  setUploadProgress(progress: number): void {
    state = { ...state, uploadProgress: Math.min(100, Math.max(0, progress)) };
    emitChange();
  },

  addUploadRecord(record: UploadRecord): void {
    state = {
      ...state,
      recentUploads: [record, ...state.recentUploads],
      uploadProgress: 100,
      isUploading: false,
    };
    emitChange();
  },

  setError(error: string | null): void {
    state = { ...state, error, isUploading: false };
    emitChange();
  },

  reset(): void {
    state = {
      ...state,
      isUploading: false,
      uploadProgress: 0,
      error: null,
    };
    emitChange();
  },
};

/**
 * Hook to access and subscribe to store state
 */
export function useStore<T>(selector: (s: AppState) => T): T {
  // Return current selector value directly (compatible with server & client components)
  return selector(store.getState());
}
