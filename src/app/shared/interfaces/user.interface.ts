export interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface CreateUserDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
}

export interface AuthResponse {
  success: boolean;
  data: {
    user: User;
    accessToken: string;
    refreshToken: string;
  };
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}
