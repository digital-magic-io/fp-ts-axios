import * as TE from 'fp-ts/lib/TaskEither'

export enum ErrorType {
  Internal = 'Internal',
  API = 'API',
  Cancelled = 'Cancelled'
}

export type AppError<T = ErrorType> = { readonly type: T }

export type CancelledError = AppError<ErrorType.Cancelled>

export type InternalError = AppError<ErrorType.Internal> & {
  readonly message: string
  readonly rootCause?: Error
}

export type ApiError<T> = AppError<ErrorType.API> & { readonly code: T }

const error = <T = ErrorType>(type: T): AppError<T> => ({ type })

export const cancelledError: CancelledError = error(ErrorType.Cancelled)

export const internalError = (message: string, rootCause?: Error): InternalError => ({
  ...error(ErrorType.Internal),
  message,
  rootCause
})

export const apiError = <T>(code: T): ApiError<T> => ({
  ...error(ErrorType.API),
  code: code
})

export type TaskEitherError<T> = TE.TaskEither<AppError, T>
export type TaskExecutor<P, T> = (params: P) => TaskEitherError<T>
export type TaskLoader<T> = () => TaskEitherError<T>
