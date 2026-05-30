import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { logger } from '@/lib/logging';
import { attachRequestIdHeader } from '@/lib/request-context';

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export interface APIErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

export function internalServerErrorResponse(): NextResponse<APIErrorResponse> {
  return attachRequestIdHeader(NextResponse.json(
    {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
    { status: 500 }
  ));
}

export function validationErrorResponse(details: unknown): NextResponse<APIErrorResponse> {
  return attachRequestIdHeader(NextResponse.json(
    {
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details,
    },
    { status: 400 }
  ));
}

export function handleAPIError(error: unknown): NextResponse<APIErrorResponse> {
  logger.error('API error', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      return internalServerErrorResponse();
    }

    return attachRequestIdHeader(NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    ));
  }

  if (error instanceof ZodError) {
    return attachRequestIdHeader(NextResponse.json(
      {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.issues.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
      { status: 400 }
    ));
  }

  return internalServerErrorResponse();
}
