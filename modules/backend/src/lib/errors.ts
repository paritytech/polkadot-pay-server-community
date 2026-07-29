// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
export type ApiErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "not_found_error"
  | "api_error";

export type ApiErrorBody = {
  error: {
    type: ApiErrorType;
    code: string;
    message: string;
    param?: string;
  };
};

export function buildApiError(
  type: ApiErrorType,
  code: string,
  message: string,
  param?: string,
): ApiErrorBody {
  return {
    error: {
      type,
      code,
      message,
      ...(param ? { param } : {}),
    },
  };
}

export class AppError extends Error {
  readonly status: number;
  readonly type: ApiErrorType;
  readonly code: string;
  readonly param?: string;
  readonly body: ApiErrorBody;

  constructor(
    status: number,
    type: ApiErrorType,
    code: string,
    message: string,
    param?: string,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.type = type;
    this.code = code;
    this.param = param;
    this.body = buildApiError(type, code, message, param);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function appError(
  status: number,
  type: ApiErrorType,
  code: string,
  message: string,
  param?: string,
): AppError {
  return new AppError(status, type, code, message, param);
}
