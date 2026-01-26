// JWT Payload structure
export interface JwtPayload {
  sub: string;       // authToken (UUID)
  tableId: string;   // TABLE_A, ADMIN etc.
  role: 'GUEST' | 'ADMIN';
  iat: number;
  exp: number;
}

// Photo metadata from DynamoDB
export interface Photo {
  eventId: string;
  createdAt: string;
  photoId: string;
  tableId: string;
  s3Key: string;
  mimeType: string;
  isVisible: boolean;
  likes: number;
  // Client-side computed
  url?: string;
}

// Auth state
export interface AuthState {
  isAuthenticated: boolean;
  jwt: string | null;
  payload: JwtPayload | null;
}

// API Response types
export interface LoginResponse {
  token: string;
}

export interface PhotosResponse {
  photos: Photo[];
  nextToken?: string;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  s3Key: string;
}

// API Error
export interface ApiError {
  error: string;
  message: string;
  retryAfter?: number;
}
